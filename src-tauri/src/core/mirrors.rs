//! GitHub mirror racing for the in-app updater.
//!
//! GitHub release downloads are frequently unreachable or very slow from
//! mainland China, which made the update check fail outright rather than merely
//! run slowly. `github.akams.cn` publishes a set of community proxy nodes that
//! serve the same content; this module races the fastest ones concurrently and
//! uses whichever answers first.
//!
//! Racing rather than pinning one node matters because these are volunteer-run
//! and disappear without notice — a fixed choice would eventually break for
//! every user at once. Direct GitHub is raced alongside the mirrors so users
//! outside China are never penalised.
//!
//! A node is addressed by prefixing the *whole* canonical URL:
//! `https://gh.catmak.name/https://github.com/owner/repo/releases/...`
//!
//! The nodes proxy the manifest but leave the asset URLs inside it pointing at
//! `api.github.com`, and most of them reject that form. So the binary is fetched
//! from the node's `releases/download/<tag>/<file>` form instead, resolved from
//! the release metadata (see [`proxied_asset_url`]).

use std::time::{Duration, Instant};

use serde::Deserialize;
use tokio::task::JoinSet;
use url::Url;

use crate::core::limits::MAX_UPDATE_JSON_BYTES;
use crate::error::SkillsageError;

/// The canonical, unproxied manifest URL. Mirrors are addressed by prefixing
/// this whole URL, which is the convention every node follows.
///
/// Must stay equal to `plugins.updater.endpoints` in `tauri.conf.json`; the
/// `manifest_url_matches_tauri_config` test enforces that so the two cannot
/// drift apart.
pub const MANIFEST_URL: &str =
    "https://github.com/aeroray/SkillSage/releases/latest/download/latest.json";

/// Proxy nodes, ordered fastest first as measured against the real manifest
/// with a warm connection. Only nodes that returned a valid manifest on every
/// attempt are listed; several others were faster on a single sample but wildly
/// inconsistent (multi-second medians), which is worse than useless here.
pub const MIRRORS: &[&str] = &[
    "https://gh.catmak.name",
    "https://cdn.akaere.online",
    "https://fastgit.cc",
    "https://githubdog.com",
    "https://github.geekery.cn",
];

/// How long any single racer may take. Racing means the slowest node costs
/// nothing as long as one node is fast, so this only bounds the worst case.
const PER_RACER_TIMEOUT: Duration = Duration::from_secs(10);

/// A unique token appended to every manifest request.
///
/// Mirrors sit behind CDNs that cache `latest.json`, and a cache hit is *faster*
/// than a fresh fetch — so racing on speed alone systematically prefers stale
/// data. Observed in practice: minutes after v1.0.3 was published, the fastest
/// node (`gh.catmak.name`) served the v1.0.2 manifest in 4 of 4 attempts, which
/// would tell an up-to-date-looking user there is nothing to install, forever.
/// A unique query string makes each request a cache miss; verified to return the
/// current release from every configured node.
///
/// The token is also carried on the winning [`ManifestHit`], because the updater
/// plugin re-fetches the manifest itself — if that second request were allowed
/// to hit the same stale cache, the race would find the new version and the
/// plugin would still report no update.
fn cache_buster() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();
    format!("skillsage={nanos}")
}

/// The winning response: which node answered and how long it took.
///
/// The body is deliberately not kept. The updater plugin re-fetches and parses
/// the manifest itself, so retaining a second copy would only risk the two
/// disagreeing about which release is current.
#[derive(Debug, Clone)]
pub struct ManifestHit {
    /// Node base URL, or `None` when direct GitHub won.
    pub mirror: Option<String>,
    pub elapsed: Duration,
    /// The cache-busting token used for this race, reused for the plugin's own
    /// fetch so it cannot be answered from the stale cache the race bypassed.
    pub token: String,
}

impl ManifestHit {
    /// The base to prefix asset URLs with, if a mirror won.
    pub fn mirror_base(&self) -> Option<&str> {
        self.mirror.as_deref()
    }

    /// The manifest URL to hand the updater plugin: the winning source, still
    /// carrying the token that bypasses the stale cache.
    pub fn endpoint(&self) -> Result<Url, SkillsageError> {
        let base = match self.mirror_base() {
            Some(base) => format!("{base}/{MANIFEST_URL}"),
            None => MANIFEST_URL.to_string(),
        };
        Ok(Url::parse(&format!("{base}?{}", self.token))?)
    }
}

/// Whether a response body is a usable updater manifest.
///
/// Mirrors sometimes answer `200 OK` with an HTML error page, so the status
/// code alone is not enough — a non-manifest body must not win the race.
fn is_valid_manifest(body: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("version").and_then(|v| v.as_str()).map(str::to_owned))
        .is_some_and(|version| !version.is_empty())
}

fn build_client(proxy: Option<&str>) -> Result<reqwest::Client, SkillsageError> {
    let mut builder = reqwest::Client::builder()
        .user_agent(concat!("SkillSage/", env!("CARGO_PKG_VERSION")))
        .timeout(PER_RACER_TIMEOUT);
    if let Some(proxy_url) = proxy {
        builder = builder.proxy(reqwest::Proxy::all(proxy_url)?);
    }
    Ok(builder.build()?)
}

/// Whether an already-buffered body may be handed to the JSON parser.
///
/// Split out from the streaming reader so the cap can be tested without a
/// network round-trip; the reader enforces the same comparison chunk by chunk.
fn is_within_limit(length: usize) -> bool {
    length <= MAX_UPDATE_JSON_BYTES
}

/// Streams a mirror response into memory, refusing to buffer more than
/// [`MAX_UPDATE_JSON_BYTES`].
///
/// Mirrors are volunteer-run third-party hosts, so their response size is not
/// trusted. `content_length()` is checked first because it lets an oversized
/// response be rejected before any body is read, but it is optional — the
/// streaming loop is what actually enforces the cap for a chunked response,
/// which would otherwise be buffered in full before a post-hoc check could
/// reject it. This mirrors `bounded_bytes` in `core/github/client.rs`.
async fn bounded_body(
    mut response: reqwest::Response,
    label: &str,
) -> Result<Vec<u8>, SkillsageError> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_UPDATE_JSON_BYTES as u64)
    {
        return Err(SkillsageError::ResponseTooLarge(format!(
            "{label}超过 {} KiB",
            MAX_UPDATE_JSON_BYTES / 1024
        )));
    }
    let mut collected = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if !is_within_limit(collected.len().saturating_add(chunk.len())) {
            return Err(SkillsageError::ResponseTooLarge(format!(
                "{label}超过 {} KiB",
                MAX_UPDATE_JSON_BYTES / 1024
            )));
        }
        collected.extend_from_slice(&chunk);
    }
    Ok(collected)
}

/// Fetches `url` and returns the body if it is a valid manifest.
async fn fetch_manifest(client: &reqwest::Client, url: &str) -> Result<String, SkillsageError> {
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(SkillsageError::Network(format!(
            "{} returned {}",
            url,
            response.status()
        )));
    }
    let bytes = bounded_body(response, "更新清单").await?;
    // Lossy like the `text()` this replaced: a node answering 200 with an HTML
    // error page in another charset is still rejected by `is_valid_manifest`,
    // and a decoding failure would only produce a less useful message.
    let body = String::from_utf8_lossy(&bytes).into_owned();
    if !is_valid_manifest(&body) {
        return Err(SkillsageError::Network(format!(
            "{url} did not return a valid update manifest"
        )));
    }
    Ok(body)
}

/// Races every mirror plus direct GitHub and returns the first valid manifest.
///
/// The first *valid* response wins, not the first response: a node that returns
/// a proxy error page quickly must not beat a node that returns the real
/// manifest a moment later.
pub async fn race_manifest(proxy: Option<String>) -> Result<ManifestHit, SkillsageError> {
    let client = build_client(proxy.as_deref())?;
    let token = cache_buster();
    let mut racers: Vec<(Option<String>, String)> = MIRRORS
        .iter()
        .map(|base| {
            (
                Some((*base).to_string()),
                format!("{base}/{MANIFEST_URL}?{token}"),
            )
        })
        .collect();
    // Direct GitHub last in the list, but all racers start together, so its
    // position only decides ties.
    racers.push((None, format!("{MANIFEST_URL}?{token}")));

    let mut set: JoinSet<(Option<String>, Result<String, SkillsageError>, Duration)> =
        JoinSet::new();
    for (mirror, url) in racers {
        let client = client.clone();
        set.spawn(async move {
            let started = Instant::now();
            let result = fetch_manifest(&client, &url).await;
            (mirror, result, started.elapsed())
        });
    }

    let mut failures: Vec<String> = Vec::new();
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok((mirror, Ok(_body), elapsed)) => {
                // Stop the losers instead of letting them run to completion.
                set.abort_all();
                return Ok(ManifestHit {
                    mirror,
                    elapsed,
                    token,
                });
            }
            Ok((mirror, Err(error), _)) => {
                failures.push(format!("{}: {error}", mirror.as_deref().unwrap_or("direct")));
            }
            Err(join_error) => failures.push(format!("task failed: {join_error}")),
        }
    }

    Err(SkillsageError::Network(format!(
        "所有更新源都无法访问：{}",
        failures.join("; ")
    )))
}

/// `(owner, repo)` parsed from [`MANIFEST_URL`].
fn repository() -> Result<(String, String), SkillsageError> {
    let url = Url::parse(MANIFEST_URL)?;
    let segments: Vec<&str> = url
        .path_segments()
        .map(|parts| parts.filter(|part| !part.is_empty()).collect())
        .unwrap_or_default();
    match segments.as_slice() {
        [owner, repo, ..] => Ok(((*owner).to_string(), (*repo).to_string())),
        _ => Err(SkillsageError::Network(
            "无法从更新地址解析出仓库信息".into(),
        )),
    }
}

/// The numeric asset id in an `api.github.com/.../releases/assets/<id>` URL.
fn asset_id_from_api_url(asset_url: &Url) -> Option<u64> {
    asset_url.path_segments()?.next_back()?.parse::<u64>().ok()
}

#[derive(Debug, Deserialize)]
struct ReleaseAsset {
    id: u64,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct ReleaseMetadata {
    assets: Vec<ReleaseAsset>,
}

/// Rewrites the manifest's asset URL into one a mirror can serve.
///
/// The manifest announces
/// `https://api.github.com/repos/<owner>/<repo>/releases/assets/<id>`, which
/// nodes generally reject (403/404 — verified against all five). The node *does*
/// serve `https://github.com/<owner>/<repo>/releases/download/<tag>/<file>`, so
/// the metadata is fetched through the same node to map the asset id onto that
/// form.
///
/// Returns `Ok(None)` when the mapping cannot be resolved, in which case the
/// caller keeps the original URL — the direct download still works outside
/// China, so a failure here must not fail the update.
pub async fn proxied_asset_url(
    mirror_base: &str,
    asset_url: &Url,
    proxy: Option<&str>,
) -> Result<Option<Url>, SkillsageError> {
    let Some(asset_id) = asset_id_from_api_url(asset_url) else {
        return Ok(None);
    };
    let (owner, repo) = repository()?;
    // Cache-busted for the same reason as the manifest: the release metadata is
    // cached too, and a stale copy would not contain the asset id the fresh
    // manifest just announced, silently dropping the download back to a direct
    // connection that cannot work in mainland China.
    let metadata_url = format!(
        "{mirror_base}/https://api.github.com/repos/{owner}/{repo}/releases/latest?{}",
        cache_buster()
    );

    let client = build_client(proxy)?;
    let response = client.get(&metadata_url).send().await?;
    if !response.status().is_success() {
        return Ok(None);
    }
    // A node is a third-party host; its response size is not trusted either.
    let bytes = match bounded_body(response, "镜像发布信息").await {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!(error = %error, "镜像发布信息读取失败，回退到直连");
            return Ok(None);
        }
    };
    let Ok(metadata) = serde_json::from_slice::<ReleaseMetadata>(&bytes) else {
        return Ok(None);
    };
    let Some(asset) = metadata.assets.iter().find(|asset| asset.id == asset_id) else {
        return Ok(None);
    };

    // Point at the node, keeping the GitHub URL as its path — the node's own
    // addressing convention.
    let proxied = format!("{mirror_base}/{}", asset.browser_download_url);
    Ok(Some(Url::parse(&proxied)?))
}

/// Name suffixes of the updater artifact for the running platform, most
/// specific first.
///
/// Only one of these exists in a release's asset list for a given platform:
/// Tauri publishes the NSIS `-setup.exe` (or `.msi`) on Windows, and the
/// `.app.tar.gz` updater artifact on macOS — the `.dmg` is listed as a fallback
/// because a dmg-only release would still announce one in its manifest.
fn installer_suffixes() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &["-setup.exe", ".msi"]
    }
    #[cfg(target_os = "macos")]
    {
        &[".app.tar.gz", ".dmg"]
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        &[]
    }
}

fn asset_size(asset: &serde_json::Value) -> Option<u64> {
    asset.get("size")?.as_u64()
}

fn asset_by_id(metadata: &serde_json::Value, id: u64) -> Option<&serde_json::Value> {
    metadata
        .get("assets")?
        .as_array()?
        .iter()
        .find(|asset| asset.get("id").and_then(|value| value.as_u64()) == Some(id))
}

fn asset_by_name<'a>(metadata: &'a serde_json::Value, name: &str) -> Option<&'a serde_json::Value> {
    metadata
        .get("assets")?
        .as_array()?
        .iter()
        .find(|asset| asset.get("name").and_then(|value| value.as_str()) == Some(name))
}

fn first_installer_asset<'a>(
    metadata: &'a serde_json::Value,
    suffixes: &[&str],
) -> Option<&'a serde_json::Value> {
    let assets = metadata.get("assets")?.as_array()?;
    for suffix in suffixes {
        if let Some(asset) = assets.iter().find(|asset| {
            asset
                .get("name")
                .and_then(|value| value.as_str())
                .is_some_and(|name| name.ends_with(suffix))
        }) {
            return Some(asset);
        }
    }
    None
}

/// The announced size of the installer the updater plugin would download, or
/// `None` when the trusted metadata cannot identify it.
///
/// Resolution order:
/// 1. the asset id in the manifest's own `api.github.com` URL — exact, and it
///    is precisely the asset the plugin will fetch;
/// 2. the file name in a `releases/download/...` URL, for a manifest that
///    announces browser URLs instead of asset ids;
/// 3. the platform's installer shape, which is the only remaining way to name
///    the expected artifact when the manifest's id is absent from the trusted
///    release (the replay case: an older signed installer under a newer tag).
fn announced_size_from_metadata(
    metadata: &serde_json::Value,
    asset_url: &Url,
    suffixes: &[&str],
) -> Option<u64> {
    if let Some(id) = asset_id_from_api_url(asset_url) {
        if let Some(size) = asset_by_id(metadata, id).and_then(asset_size) {
            return Some(size);
        }
    }
    if let Some(name) = asset_url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
    {
        if !name.is_empty() {
            if let Some(size) = asset_by_name(metadata, name).and_then(asset_size) {
                return Some(size);
            }
        }
    }
    first_installer_asset(metadata, suffixes).and_then(asset_size)
}

/// Whether `version` can be used as a release tag path segment.
///
/// A semver string never contains `/`, so this is defence in depth: the value
/// reaches an API path, and a malformed one must not be interpolated. It is
/// not an error — a version the trusted API cannot address simply means the
/// cross-check has no data, and the update proceeds.
fn is_addressable_version(version: &str) -> bool {
    !version.is_empty()
        && version.len() <= 64
        && version.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '+')
        })
}

/// The announced size of the installer asset for `version`, read from GitHub's
/// trusted API (not from a mirror's copy of the release metadata).
///
/// This is a **size** cross-check, not a hash check: the updater plugin
/// exposes no digest for the downloaded artifact, so the byte length is the
/// only signal available without re-implementing the release format. It is
/// enough to catch the replay this guards against — an older signed installer
/// served under a newer version label has a different length from the asset
/// that version actually published. Minisign still proves the bytes are a
/// genuine release; this proves they are *this* release.
///
/// Every failure path returns `None` rather than an error: a rate limit or a
/// network hiccup while reading metadata must not break an otherwise valid
/// update, so the caller logs and installs. The one thing this function must
/// never do is report a size it did not read from the trusted tag.
///
/// The request goes to `api.github.com` directly and never through a mirror,
/// even when a mirror won the manifest race: a mirror-supplied "expected size"
/// would be exactly what a malicious node controls, so consulting one here
/// would neutralise the check it is meant to perform. The cost of that choice
/// is that where the GitHub API itself is unreachable the check fails open and
/// only the minisign signature protects the download — the deliberate
/// trade-off of never turning unreachable metadata into a broken update.
pub async fn announced_asset_size(
    version: &str,
    asset_url: &Url,
    proxy: Option<&str>,
) -> Option<u64> {
    if !is_addressable_version(version) {
        tracing::warn!(version, "更新版本号无法用于查询发布信息，跳过大小校验");
        return None;
    }
    let (owner, repo) = match repository() {
        Ok(repository) => repository,
        Err(error) => {
            tracing::warn!(error = %error, "无法解析仓库信息，跳过更新包大小校验");
            return None;
        }
    };
    // Cache-busted like every other release-metadata request (constraint 30):
    // a stale cached response would report the *previous* release's asset
    // sizes, which are not what the version under check published, and the
    // cross-check would fail a legitimate update instead of a replayed one.
    let url = format!(
        "https://api.github.com/repos/{owner}/{repo}/releases/tags/v{version}?{}",
        cache_buster()
    );
    let client = match build_client(proxy) {
        Ok(client) => client,
        Err(error) => {
            tracing::warn!(error = %error, "无法创建 GitHub 请求客户端，跳过更新包大小校验");
            return None;
        }
    };
    let response = match client
        .get(&url)
        .header("accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(error = %error, "无法读取 GitHub 发布信息，跳过更新包大小校验");
            return None;
        }
    };
    if !response.status().is_success() {
        tracing::warn!(status = %response.status(), "GitHub 发布信息请求失败，跳过更新包大小校验");
        return None;
    }
    let bytes = match bounded_body(response, "GitHub 发布信息").await {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!(error = %error, "GitHub 发布信息读取失败，跳过更新包大小校验");
            return None;
        }
    };
    let metadata: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(metadata) => metadata,
        Err(error) => {
            tracing::warn!(error = %error, "GitHub 发布信息无法解析，跳过更新包大小校验");
            return None;
        }
    };
    let size = announced_size_from_metadata(&metadata, asset_url, installer_suffixes());
    if size.is_none() {
        tracing::warn!(
            version,
            "GitHub 发布信息中找不到对应的安装包，跳过更新包大小校验"
        );
    }
    size
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_url_matches_tauri_config() {
        // The updater's configured endpoint and the URL this module races must
        // be the same, or a mirror could serve a different release than the
        // plugin would have fetched directly.
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("valid tauri.conf.json");
        let endpoints = config["plugins"]["updater"]["endpoints"]
            .as_array()
            .expect("updater endpoints");
        let configured = endpoints
            .iter()
            .filter_map(|value| value.as_str())
            .collect::<Vec<_>>();
        assert!(
            configured.contains(&MANIFEST_URL),
            "MANIFEST_URL drifted from tauri.conf.json: {configured:?}"
        );
    }

    #[test]
    fn accepts_a_real_manifest_and_rejects_other_bodies() {
        assert!(is_valid_manifest(r#"{"version":"1.0.2","platforms":{}}"#));
        // A mirror answering 200 with an error page must not win the race.
        assert!(!is_valid_manifest("<html><body>Not Found</body></html>"));
        assert!(!is_valid_manifest(r#"{"error":"rate limited"}"#));
        assert!(!is_valid_manifest(r#"{"version":""}"#));
        assert!(!is_valid_manifest(""));
    }

    #[test]
    fn parses_owner_and_repo_from_the_manifest_url() {
        let (owner, repo) = repository().expect("repository");
        assert_eq!(owner, "aeroray");
        assert_eq!(repo, "SkillSage");
    }

    #[test]
    fn extracts_the_asset_id_from_an_api_url() {
        let url =
            Url::parse("https://api.github.com/repos/aeroray/SkillSage/releases/assets/556955915")
                .expect("url");
        assert_eq!(asset_id_from_api_url(&url), Some(556955915));

        let not_an_asset =
            Url::parse("https://api.github.com/repos/aeroray/SkillSage").expect("url");
        assert_eq!(asset_id_from_api_url(&not_an_asset), None);
    }

    #[test]
    fn every_mirror_is_a_bare_https_origin() {
        for mirror in MIRRORS {
            let url = Url::parse(mirror).expect("mirror should parse");
            assert_eq!(url.scheme(), "https", "{mirror} must be https");
            assert_eq!(url.path(), "/", "{mirror} must be a bare origin");
            assert!(url.query().is_none(), "{mirror} must not carry a query");
        }
    }

    #[test]
    fn the_cache_buster_changes_between_calls() {
        // Mirrors cache latest.json, and a cache hit is faster than a fresh
        // fetch, so a constant token would let the race prefer stale data.
        let first = cache_buster();
        let second = cache_buster();
        assert_ne!(first, second, "the token must differ per call");
        assert!(first.starts_with("skillsage="));
    }

    #[test]
    fn the_plugin_endpoint_keeps_the_cache_buster() {
        // The plugin re-fetches the manifest itself. If that request dropped the
        // token it could be served from the stale cache the race just bypassed,
        // and the check would find a new version only to report none.
        let hit = ManifestHit {
            mirror: Some("https://gh.catmak.name".to_string()),
            elapsed: Duration::from_millis(200),
            token: "skillsage=123".to_string(),
        };
        let endpoint = hit.endpoint().expect("endpoint");
        assert_eq!(
            endpoint.as_str(),
            format!("https://gh.catmak.name/{MANIFEST_URL}?skillsage=123")
        );

        // Direct GitHub must keep the token too.
        let direct = ManifestHit {
            mirror: None,
            elapsed: Duration::ZERO,
            token: "skillsage=456".to_string(),
        };
        assert_eq!(
            direct.endpoint().expect("endpoint").as_str(),
            format!("{MANIFEST_URL}?skillsage=456")
        );
    }

    #[test]
    fn a_body_within_the_limit_is_accepted_and_an_oversized_one_is_not() {
        // The streaming reader compares accumulated length against this, so the
        // boundary itself is what has to be right.
        assert!(is_within_limit(0));
        assert!(is_within_limit(1024));
        assert!(is_within_limit(MAX_UPDATE_JSON_BYTES));
        assert!(!is_within_limit(MAX_UPDATE_JSON_BYTES + 1));
        assert!(!is_within_limit(MAX_UPDATE_JSON_BYTES * 2));
    }

    #[test]
    fn a_manifest_and_release_metadata_fit_the_update_limit() {
        // The limit must not reject a real document: a mirror that returns a
        // valid manifest slightly over the cap would otherwise fail the race
        // for every user at once. 256 KiB is ~40x the observed ~6.5 KiB.
        // Asserted at compile time rather than in a test body, because clippy
        // is right that comparing two constants at runtime proves nothing.
        const _: () = assert!(MAX_UPDATE_JSON_BYTES >= 64 * 1024);
        const _: () = assert!(MAX_UPDATE_JSON_BYTES <= crate::core::limits::MAX_REMOTE_JSON_BYTES);
    }

    #[test]
    fn reads_the_announced_size_of_the_installers_asset_id() {
        // The manifest points at an asset id; the trusted metadata resolves it.
        let metadata = serde_json::json!({
            "assets": [
                { "id": 10, "name": "SkillSage_1.0.6_aarch64.app.tar.gz", "size": 7_058_805 },
                { "id": 11, "name": "SkillSage_1.0.6_x64-setup.exe", "size": 4_473_815 },
            ]
        });
        let asset_url =
            Url::parse("https://api.github.com/repos/aeroray/SkillSage/releases/assets/11")
                .expect("url");
        assert_eq!(
            announced_size_from_metadata(&metadata, &asset_url, installer_suffixes()),
            Some(4_473_815)
        );
    }

    #[test]
    fn falls_back_to_the_browser_download_url_name() {
        // A manifest that announces a browser URL instead of an asset id still
        // maps onto the trusted metadata by file name.
        let metadata = serde_json::json!({
            "assets": [
                { "id": 11, "name": "SkillSage_1.0.6_x64-setup.exe", "size": 4_473_815 },
            ]
        });
        let asset_url = Url::parse(
            "https://github.com/aeroray/SkillSage/releases/download/v1.0.6/SkillSage_1.0.6_x64-setup.exe",
        )
        .expect("url");
        assert_eq!(
            announced_size_from_metadata(&metadata, &asset_url, installer_suffixes()),
            Some(4_473_815)
        );
    }

    #[test]
    fn falls_back_to_the_installer_shaped_asset_when_the_id_is_unknown() {
        // The replay this guards against: the manifest announces a *newer*
        // version but its asset id belongs to an older release, so it is absent
        // from the trusted tag. The installer shape still identifies the asset
        // whose size the new version published.
        let metadata = serde_json::json!({
            "assets": [
                { "id": 20, "name": "SkillSage_1.0.6_x64-setup.exe", "size": 4_473_815 },
                { "id": 21, "name": "SkillSage_1.0.6_x64-setup.exe.sig", "size": 420 },
                { "id": 22, "name": "latest.json", "size": 6_616 },
            ]
        });
        let stale_asset_url =
            Url::parse("https://api.github.com/repos/aeroray/SkillSage/releases/assets/99")
                .expect("url");
        let suffixes = installer_suffixes();
        if suffixes.is_empty() {
            // A host with no updater artifact has nothing to cross-check.
            assert_eq!(
                announced_size_from_metadata(&metadata, &stale_asset_url, suffixes),
                None
            );
            return;
        }
        assert_eq!(
            announced_size_from_metadata(&metadata, &stale_asset_url, suffixes),
            Some(4_473_815)
        );
        // The signature sidecar must never be mistaken for the installer.
        assert_ne!(
            announced_size_from_metadata(&metadata, &stale_asset_url, suffixes),
            Some(420)
        );
    }

    #[test]
    fn an_unknown_asset_is_accepted_rather_than_failing_the_update() {
        // Fail open: metadata without the asset, without sizes, or empty must
        // yield `None` so the caller installs normally. A mirror or a rate
        // limit must not be able to break updates entirely.
        let asset_url =
            Url::parse("https://api.github.com/repos/aeroray/SkillSage/releases/assets/99")
                .expect("url");
        assert_eq!(
            announced_size_from_metadata(
                &serde_json::json!({ "assets": [] }),
                &asset_url,
                installer_suffixes()
            ),
            None
        );
        assert_eq!(
            announced_size_from_metadata(&serde_json::json!({}), &asset_url, installer_suffixes()),
            None
        );
        assert_eq!(
            announced_size_from_metadata(
                &serde_json::json!({ "assets": [{ "id": 1, "name": "x" }] }),
                &asset_url,
                installer_suffixes()
            ),
            None
        );
        // Nothing installer-shaped is present at all.
        assert_eq!(
            announced_size_from_metadata(
                &serde_json::json!({ "assets": [{ "id": 1, "name": "latest.json", "size": 10 }] }),
                &asset_url,
                installer_suffixes()
            ),
            None
        );
    }

    #[test]
    fn rejects_a_version_that_cannot_address_a_release_tag() {
        assert!(is_addressable_version("1.0.6"));
        assert!(is_addressable_version("1.0.6-beta.1+build2"));
        assert!(!is_addressable_version(""));
        // The value reaches an API path; a malformed one must not be sent.
        assert!(!is_addressable_version("1.0.6/../../other"));
        assert!(!is_addressable_version(&"1".repeat(65)));
    }
}
