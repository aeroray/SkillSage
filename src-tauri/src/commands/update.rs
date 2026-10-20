//! In-app update check and install.
//!
//! The updater plugin is used for its signature verification and platform
//! installer, but not for endpoint selection: the plugin walks its endpoint
//! list *sequentially*, so on a network where the first endpoint hangs the user
//! waits out the timeout before the next is tried. This module races the
//! mirrors concurrently instead (see [`crate::core::mirrors`]) and hands the
//! plugin a single winning endpoint.
//!
//! Only the transport is ours. The plugin still verifies the minisign signature
//! over the downloaded bytes against the configured public key, so fetching the
//! binary from a community mirror cannot substitute different content — a
//! tampered mirror produces a signature failure, not an install.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

use crate::core::mirrors;
use crate::error::SkillsageError;

/// Connect and read (idle) timeouts for the updater plugin's client.
///
/// The plugin applies no timeout at all unless one is configured, so a mirror
/// that completes the TLS handshake and then stalls would hang
/// `check_app_update` / `install_app_update` forever. A *total* timeout is not
/// used because a legitimate installer download is large and slow on the
/// connections this app targets; bounding connect and per-read silence keeps
/// the useful failure mode (a dead node) without cutting off a working download.
const UPDATER_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const UPDATER_READ_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    pub date: Option<String>,
    /// Which source answered — a mirror base, or `direct`. Surfaced so a
    /// failing or slow source is diagnosable rather than invisible.
    pub source: String,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateProgress {
    pub phase: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn source_label(mirror: Option<&str>) -> String {
    mirror.unwrap_or("direct").to_string()
}

/// Races every mirror plus direct GitHub and returns the first valid manifest.
///
/// Exposed separately so the UI can report *which* source answered; the check
/// itself is deliberately cheap (one small JSON GET).
pub async fn race(proxy: Option<String>) -> Result<mirrors::ManifestHit, SkillsageError> {
    mirrors::race_manifest(proxy).await
}

/// Builds an updater pointed at one already-chosen endpoint.
///
/// The endpoint comes from the hit rather than being rebuilt here so it keeps
/// the race's cache-busting token: without it the plugin's own fetch could be
/// answered from the same stale cache the race just bypassed, and the check
/// would find the new version only to report no update.
fn updater_for(
    app: &AppHandle,
    hit: &mirrors::ManifestHit,
    proxy: Option<&str>,
) -> Result<tauri_plugin_updater::Updater, SkillsageError> {
    let mut builder = app.updater_builder().endpoints(vec![hit.endpoint()?])?;
    // `configure_client` hands the plugin's own `reqwest` builder here, so the
    // timeouts are the only thing set; endpoint and proxy handling stay above.
    builder = builder.configure_client(|client| {
        client
            .connect_timeout(UPDATER_CONNECT_TIMEOUT)
            .read_timeout(UPDATER_READ_TIMEOUT)
    });
    if let Some(proxy_url) = proxy {
        builder = builder.proxy(Url::parse(proxy_url)?);
    }
    Ok(builder.build()?)
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    proxy: Option<String>,
) -> Result<Option<AppUpdateInfo>, SkillsageError> {
    check_app_update_with(&app, proxy).await
}

/// The check body, taking the handle explicitly so it is testable and so the
/// command stays a thin wrapper.
pub async fn check_app_update_with(
    app: &AppHandle,
    proxy: Option<String>,
) -> Result<Option<AppUpdateInfo>, SkillsageError> {
    let hit = race(proxy.clone()).await?;
    let updater = updater_for(app, &hit, proxy.as_deref())?;
    let update = updater.check().await?;
    Ok(update.map(|update| AppUpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone(),
        date: update.date.map(|date| date.to_string()),
        source: source_label(hit.mirror_base()),
        elapsed_ms: hit.elapsed.as_millis() as u64,
    }))
}

/// Downloads and installs the pending update, streaming progress to the
/// frontend as `app-update-progress`.
#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    proxy: Option<String>,
) -> Result<(), SkillsageError> {
    let hit = race(proxy.clone()).await?;
    let updater = updater_for(&app, &hit, proxy.as_deref())?;
    let Some(mut update) = updater.check().await? else {
        return Err(SkillsageError::Network("没有可用的更新".into()));
    };

    // The manifest's own asset URL identifies the exact artifact (an
    // `api.github.com/.../assets/<id>`), so the size cross-check below resolves
    // it before the mirror rewrite replaces `update.download_url` with the
    // node's `releases/download/...` path.
    let announced_url = update.download_url.clone();
    // The manifest leaves the asset URL pointing at `api.github.com`, which
    // mirrors reject; rewrite it onto the node that served the manifest. If the
    // rewrite cannot be resolved the original URL is kept, because a direct
    // download still works outside mainland China — a failure here must not
    // turn a working update into a broken one.
    if let Some(base) = hit.mirror_base() {
        match mirrors::proxied_asset_url(base, &update.download_url, proxy.as_deref()).await {
            Ok(Some(proxied)) => update.download_url = proxied,
            Ok(None) => {
                tracing::warn!("无法将下载地址映射到镜像，回退到直连");
            }
            Err(error) => {
                tracing::warn!(error = %error, "镜像下载地址解析失败，回退到直连");
            }
        }
    }

    let app_for_progress = app.clone();
    let mut downloaded: u64 = 0;
    // Downloaded separately from installation so the verified bytes can be
    // cross-checked against the announced version *before* the installer runs.
    // `download` returns only minisign-verified bytes, so signature
    // verification still happens on every path.
    let bytes = update
        .download(
            move |chunk_length, content_length| {
                downloaded += chunk_length as u64;
                let _ = app_for_progress.emit(
                    "app-update-progress",
                    AppUpdateProgress {
                        phase: "downloading".into(),
                        downloaded,
                        total: content_length,
                    },
                );
            },
            // The install phase is reported after the size cross-check below,
            // not here: the download callback fires before that check runs, so
            // announcing it now would claim an install that may be aborted.
            || {},
        )
        .await?;

    // Minisign proves the release key signed these bytes *at some point*; it
    // does not prove they belong to `update.version`, which is just a string in
    // a mirror-supplied manifest. Because the UI shows that string and the
    // plugin trusts that manifest's URL/signature pair, a racing mirror could
    // serve an older release's signed installer under a newer label — a silent
    // downgrade presented as the newest version. Binding the downloaded length
    // to the size the trusted GitHub API publishes for that tag closes it.
    //
    // The check fails open when the size cannot be established (network error,
    // rate limit, unidentified asset): metadata must never be able to break a
    // working update. It fails closed only when the size is known and differs.
    let expected_size =
        mirrors::announced_asset_size(&update.version, &announced_url, proxy.as_deref()).await;
    let actual_size = bytes.len() as u64;
    match expected_size {
        Some(expected) if expected != actual_size => {
            tracing::warn!(
                version = %update.version,
                expected,
                actual = actual_size,
                "更新包大小与发布信息不一致，已中止安装"
            );
            return Err(SkillsageError::Network(format!(
                "更新包校验失败：v{} 的安装包大小与发布信息不一致（预期 {expected} 字节，实际 {actual_size} 字节），已中止安装",
                update.version
            )));
        }
        Some(_) => {}
        None => {
            tracing::warn!(
                version = %update.version,
                "无法从 GitHub 获取发布信息，跳过更新包大小校验"
            );
        }
    }

    // The download finished and passed both checks; the installer is about to
    // run. The final size comes from the verified bytes rather than the
    // progress counter, whose last value lives inside the download closure.
    let _ = app.emit(
        "app-update-progress",
        AppUpdateProgress {
            phase: "installing".into(),
            downloaded: actual_size,
            total: None,
        },
    );
    update.install(bytes)?;
    Ok(())
}
