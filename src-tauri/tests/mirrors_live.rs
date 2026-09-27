//! Live checks against the real mirror nodes.
//!
//! These are `#[ignore]`d because they need network access and depend on
//! volunteer-run hosts that come and go; run them explicitly with
//! `cargo test --test mirrors_live -- --ignored --nocapture`.
//!
//! They exist because the interesting behaviour — racing, and rewriting the
//! manifest's asset URL into a form a node will actually serve — cannot be
//! verified with a mock: the whole question is what the real nodes do.

use app_lib::core::mirrors;

#[tokio::test]
#[ignore = "requires network access to third-party mirrors"]
async fn racing_returns_a_valid_manifest_from_some_source() {
    let hit = mirrors::race_manifest(None)
        .await
        .expect("at least one source should answer");
    println!(
        "winner: {} in {}ms",
        hit.mirror.as_deref().unwrap_or("direct"),
        hit.elapsed.as_millis()
    );
    // A winner must be a known node or direct GitHub, never an unexpected host.
    if let Some(base) = hit.mirror.as_deref() {
        assert!(
            mirrors::MIRRORS.contains(&base),
            "unexpected mirror won the race: {base}"
        );
    }
}

#[tokio::test]
#[ignore = "requires network access to third-party mirrors"]
async fn every_configured_mirror_serves_the_manifest() {
    // A dead node in the list is not fatal (it just loses the race) but it
    // should be noticed, since it means the list has gone stale.
    let mut dead = Vec::new();
    for base in mirrors::MIRRORS {
        let url = format!("{base}/{}", mirrors::MANIFEST_URL);
        match reqwest::get(&url).await {
            Ok(response) if response.status().is_success() => {
                let body = response.text().await.unwrap_or_default();
                if !body.contains("\"version\"") {
                    dead.push(format!("{base}: 200 but not a manifest"));
                }
            }
            Ok(response) => dead.push(format!("{base}: HTTP {}", response.status())),
            Err(error) => dead.push(format!("{base}: {error}")),
        }
    }
    assert!(
        dead.len() < mirrors::MIRRORS.len(),
        "every mirror is dead: {dead:#?}"
    );
    if !dead.is_empty() {
        println!("nodes needing replacement:\n{}", dead.join("\n"));
    }
}

#[tokio::test]
#[ignore = "requires network access to third-party mirrors"]
async fn the_manifest_asset_url_can_be_rewritten_onto_a_mirror() {
    // This is the part that makes the *download* mirrorable. The manifest points
    // the asset at api.github.com, which nodes reject, so it has to be mapped
    // onto the node's releases/download form.
    //
    // A specific node is used rather than the race winner: on a machine with
    // direct GitHub access the winner is often GitHub itself, and the rewrite
    // path is exactly what would then go untested.
    let mut checked = 0;
    for base in mirrors::MIRRORS {
        let manifest_url = format!("{base}/{}", mirrors::MANIFEST_URL);
        let Ok(response) = reqwest::get(&manifest_url).await else {
            continue;
        };
        let Ok(manifest) = response.json::<serde_json::Value>().await else {
            continue;
        };
        let Some(asset) = manifest["platforms"]["windows-x86_64-nsis"]["url"].as_str() else {
            continue;
        };
        let asset_url = url::Url::parse(asset).expect("asset url");
        assert!(
            asset_url.host_str() == Some("api.github.com"),
            "the manifest is expected to announce an api.github.com asset; \
             if a node started rewriting it, this rewrite would be unnecessary"
        );

        let Ok(Some(proxied)) = mirrors::proxied_asset_url(base, &asset_url, None).await else {
            println!("{base}: could not resolve the asset, skipping");
            continue;
        };
        assert!(proxied.as_str().starts_with(base));
        assert!(proxied.as_str().contains("/releases/download/"));

        let response = reqwest::get(proxied.as_str()).await.expect("download");
        if !response.status().is_success() {
            println!("{base}: download returned {}, skipping", response.status());
            continue;
        }
        let bytes = response.bytes().await.expect("body");
        assert!(bytes.len() > 1000, "expected a real installer");
        assert_eq!(&bytes[..2], b"MZ", "expected a Windows executable");
        println!(
            "{base}: rewritten -> {} bytes with an MZ header",
            bytes.len()
        );
        checked += 1;
        if checked == 2 {
            break;
        }
    }
    assert!(
        checked > 0,
        "no node could serve the rewritten asset url; the download would fall back to direct"
    );
}
