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

/// Fetches `url` and returns the body if it is a valid manifest.
async fn fetch_manifest(
    client: &reqwest::Client,
    url: &str,
) -> Result<String, SkillsageError> {
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(SkillsageError::Network(format!(
            "{} returned {}",
            url,
            response.status()
        )));
    }
    let body = response.text().await?;
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
    asset_url
        .path_segments()?
        .next_back()?
        .parse::<u64>()
        .ok()
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
    let Ok(metadata) = response.json::<ReleaseMetadata>().await else {
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
        let url = Url::parse("https://api.github.com/repos/aeroray/SkillSage/releases/assets/556955915")
            .expect("url");
        assert_eq!(asset_id_from_api_url(&url), Some(556955915));

        let not_an_asset = Url::parse("https://api.github.com/repos/aeroray/SkillSage").expect("url");
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
}
