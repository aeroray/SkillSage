//! Live verification of the GitHub-URL install chain's commit pinning.
//!
//! These are `#[ignore]`d because they need network access and depend on a real
//! public repository. Run them explicitly:
//!
//! ```text
//! cargo test --offline --test url_install_live -- --ignored --nocapture
//! ```
//!
//! Why these exist: `inspect_github_url` resolves a branch to a commit so the
//! preview can read a SKILL.md, and `url_install` must install *that* commit
//! rather than re-resolving the branch. Without the pin, anything pushed to the
//! branch between the preview and the click would be installed instead of what
//! the user reviewed — and the manifest name from the new commit decides the
//! on-disk directory. A unit test cannot prove this because the whole point is
//! what the real GitHub API returns for a reference versus a SHA.

use app_lib::core::github::client::GitHubClient;
use app_lib::core::url_install;

/// A small, stable public repository that contains a SKILL.md.
const REPO_URL: &str = "https://github.com/anthropics/skills/tree/main/skills/frontend-design";

fn client() -> GitHubClient {
    GitHubClient::new_with_config(None, None).expect("client should build")
}

fn is_full_sha(value: &str) -> bool {
    value.len() == 40 && value.chars().all(|c| c.is_ascii_hexdigit())
}

#[tokio::test]
#[ignore = "requires network access to the GitHub API"]
async fn inspection_surfaces_a_resolved_commit_not_the_typed_reference() {
    let client = client();
    let (parsed, skills, resolved_commit) = url_install::resolve_skills(&client, REPO_URL)
        .await
        .expect("inspection should succeed");

    // The typed reference stays as typed; the resolved commit is a real SHA.
    assert_eq!(parsed.commit, "main");
    assert!(
        is_full_sha(&resolved_commit),
        "resolved commit should be a 40-char SHA, got {resolved_commit:?}"
    );
    assert_ne!(
        resolved_commit, parsed.commit,
        "a branch name must not be reported as the resolved commit"
    );
    assert!(!skills.is_empty(), "the repository should offer a skill");

    println!("reference={} resolved={resolved_commit}", parsed.commit);
}

#[tokio::test]
#[ignore = "requires network access to the GitHub API"]
async fn a_pinned_install_resolves_the_pinned_commit() {
    let client = client();
    let (_parsed, skills, resolved_commit) = url_install::resolve_skills(&client, REPO_URL)
        .await
        .expect("inspection should succeed");
    let skill_path = skills[0].skill_path.clone();

    // Installing with the pin must report the pinned commit as the version.
    let pinned = url_install::resolve_detail(
        &client,
        REPO_URL,
        Some(skill_path.clone()),
        Some(&resolved_commit),
    )
    .await
    .expect("pinned resolution should succeed");

    assert_eq!(
        pinned.version.as_deref(),
        Some(resolved_commit.as_str()),
        "the installed version must be the commit that was previewed"
    );
    assert_eq!(
        pinned.skill_path.as_deref(),
        Some(skill_path.as_str()),
        "the pinned install must use the selected skill path"
    );
    assert!(
        !pinned.files.is_empty(),
        "the pinned install should fetch the skill's files"
    );

    // An unpinned install resolves the branch, which must also be a valid SHA.
    let unpinned =
        url_install::resolve_detail(&client, REPO_URL, Some(skill_path), None)
            .await
            .expect("unpinned resolution should succeed");
    let unpinned_sha = unpinned.version.expect("unpinned version");
    assert!(is_full_sha(&unpinned_sha));

    // The whole point: the previewed commit is what a pinned install uses, and
    // the reference `main` is never handed to the file fetcher as a version.
    assert_eq!(unpinned_sha, resolved_commit);
    println!("pinned==unpinned=={resolved_commit} (branch had not moved)");
}

#[tokio::test]
#[ignore = "requires network access to the GitHub API"]
async fn a_malformed_pin_is_rejected_rather_than_interpolated() {
    let client = client();
    // A crafted pin must not reach the API URL builder.
    let error = url_install::resolve_detail(
        &client,
        REPO_URL,
        None,
        Some("../../etc/passwd"),
    )
    .await
    .expect_err("a traversal-shaped pin must be rejected");
    let message = error.to_string();
    assert!(
        message.contains("不安全") || message.contains("unsafe"),
        "expected an unsafe-reference rejection, got: {message}"
    );
    println!("rejected as expected: {message}");
}
