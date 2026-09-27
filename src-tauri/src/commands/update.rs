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

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

use crate::core::mirrors::{self, MANIFEST_URL};
use crate::error::SkillsageError;

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

/// The manifest URL to hand the plugin: through the winning mirror when one
/// won, otherwise the canonical GitHub URL.
fn endpoint_for(mirror: Option<&str>) -> Result<Url, SkillsageError> {
    match mirror {
        Some(base) => Ok(Url::parse(&format!("{base}/{MANIFEST_URL}"))?),
        None => Ok(Url::parse(MANIFEST_URL)?),
    }
}

/// Races every mirror plus direct GitHub and returns the first valid manifest.
///
/// Exposed separately so the UI can report *which* source answered; the check
/// itself is deliberately cheap (one small JSON GET).
pub async fn race(proxy: Option<String>) -> Result<mirrors::ManifestHit, SkillsageError> {
    mirrors::race_manifest(proxy).await
}

/// Builds an updater pointed at one already-chosen endpoint.
fn updater_for(
    app: &AppHandle,
    mirror: Option<&str>,
    proxy: Option<&str>,
) -> Result<tauri_plugin_updater::Updater, SkillsageError> {
    let mut builder = app
        .updater_builder()
        .endpoints(vec![endpoint_for(mirror)?])?;
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
    let updater = updater_for(app, hit.mirror_base(), proxy.as_deref())?;
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
    let updater = updater_for(&app, hit.mirror_base(), proxy.as_deref())?;
    let Some(mut update) = updater.check().await? else {
        return Err(SkillsageError::Network("没有可用的更新".into()));
    };

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
    let result = update
        .download_and_install(
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
            move || {
                let _ = app.emit(
                    "app-update-progress",
                    AppUpdateProgress {
                        phase: "installing".into(),
                        downloaded,
                        total: None,
                    },
                );
            },
        )
        .await?;
    Ok(result)
}
