use serde::Serialize;
use std::sync::Arc;

use crate::core::github::{client::GitHubClient, download::fetch_skill_files};
use crate::core::limits::MAX_REMOTE_SKILL_CANDIDATES;
use crate::core::skill::parser::parse_skill_md;
use crate::core::store::models::{SkillDetail, SkillFile};
use crate::error::SkillsageError;

use super::parser::{parse, GitHubUrlResult};

/// Cap on simultaneous per-candidate manifest probes. Mirrors the bounded
/// concurrency the file downloader uses so a large repository cannot open an
/// unbounded number of GitHub requests at once.
const MAX_CONCURRENT_CANDIDATE_PROBES: usize = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlSkillCandidate {
    pub name: String,
    pub description: String,
    pub skill_path: String,
    pub url: String,
}

/// Resolves a URL into the skills it offers, **and the immutable commit those
/// skills were read from**.
///
/// The commit is returned separately from `GitHubUrlResult.commit` (which holds
/// the reference the user typed) because the caller must be able to hand it back
/// to `resolve_detail` to pin the install. Without that pin the install
/// re-resolves the branch, so anything pushed to it between the preview and the
/// click would be installed instead of what was shown — the manifest name read
/// from the new commit even decides the on-disk directory.
pub async fn resolve_skills(
    client: &GitHubClient,
    raw_url: &str,
) -> Result<(GitHubUrlResult, Vec<UrlSkillCandidate>, String), SkillsageError> {
    let parsed = parse(raw_url)?;
    let reference = resolve_reference(client, &parsed).await?;
    let commit = client
        .get_commit_sha(&parsed.owner, &parsed.repo, &reference)
        .await?;
    if let Some(skill_path) = &parsed.skill_path {
        let candidate = candidate_at(client, &parsed, &reference, &commit, skill_path).await?;
        return Ok((parsed, vec![candidate], commit));
    }

    let tree = client
        .get_tree(&parsed.owner, &parsed.repo, &commit)
        .await?;
    let mut paths = tree
        .tree
        .iter()
        .filter(|entry| entry.entry_type == "blob" && entry.path.ends_with("SKILL.md"))
        .filter_map(|entry| {
            entry
                .path
                .strip_suffix("/SKILL.md")
                .or_else(|| (entry.path == "SKILL.md").then_some(""))
        })
        .map(str::to_string)
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    if paths.len() > MAX_REMOTE_SKILL_CANDIDATES {
        return Err(SkillsageError::ResponseTooLarge(format!(
            "仓库包含超过 {MAX_REMOTE_SKILL_CANDIDATES} 个可安装技能"
        )));
    }

    // Probe candidates concurrently with a bounded semaphore. Results are
    // re-ordered by the original index so the listing stays deterministic.
    let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_CANDIDATE_PROBES));
    let mut jobs = tokio::task::JoinSet::new();
    for (index, path) in paths.into_iter().enumerate() {
        let client = client.clone();
        let parsed = parsed.clone();
        let reference = reference.clone();
        let commit = commit.clone();
        let semaphore = semaphore.clone();
        jobs.spawn(async move {
            let _permit = semaphore
                .acquire_owned()
                .await
                .map_err(|error| SkillsageError::Task(error.to_string()))?;
            let candidate =
                candidate_at(&client, &parsed, &reference, &commit, &path).await?;
            Ok::<_, SkillsageError>((index, candidate))
        });
    }

    // One unusable candidate must not hide every other skill in the repository:
    // a repo with 99 good skills and one unreadable SKILL.md should still list
    // the 99. This matches how `tree.rs` already treats the same situation when
    // it resolves a skill by manifest name.
    let mut ordered = Vec::new();
    let mut first_error = None;
    while let Some(result) = jobs.join_next().await {
        match result.map_err(|error| SkillsageError::Task(error.to_string())) {
            Ok(Ok((index, candidate))) => ordered.push((index, candidate)),
            Ok(Err(error)) => {
                tracing::warn!(error = %error, "跳过无法读取的技能候选");
                first_error.get_or_insert(error);
            }
            Err(error) => {
                tracing::warn!(error = %error, "技能候选探测任务异常结束");
                first_error.get_or_insert(error);
            }
        }
    }
    // Everything failed: surface the reason rather than an empty list, which
    // the dialog would render as "0 个技能" with no explanation.
    if ordered.is_empty() {
        if let Some(error) = first_error {
            return Err(error);
        }
    }
    ordered.sort_by_key(|(index, _)| *index);
    Ok((
        parsed,
        ordered.into_iter().map(|(_, item)| item).collect(),
        commit,
    ))
}

/// Resolves the exact files to install.
///
/// `pinned_commit` is the commit returned by [`resolve_skills`] for the preview
/// the user approved. When it is present the branch is **not** re-resolved, so
/// the installed bytes are the previewed bytes even if the branch moved in
/// between. It is validated like any other reference, so a malformed value from
/// the frontend is rejected rather than interpolated into a URL.
pub async fn resolve_detail(
    client: &GitHubClient,
    raw_url: &str,
    selected_path: Option<String>,
    pinned_commit: Option<&str>,
) -> Result<SkillDetail, SkillsageError> {
    let parsed = parse(raw_url)?;
    let skill_path = selected_path.or(parsed.skill_path.clone()).ok_or_else(|| {
        SkillsageError::InvalidGithubUrl("仓库地址未指定技能，请先选择仓库中的技能".into())
    })?;
    let commit = match pinned_commit.map(str::trim).filter(|value| !value.is_empty()) {
        Some(pinned) => {
            client
                .get_commit_sha(&parsed.owner, &parsed.repo, pinned)
                .await?
        }
        None => {
            let reference = resolve_reference(client, &parsed).await?;
            client
                .get_commit_sha(&parsed.owner, &parsed.repo, &reference)
                .await?
        }
    };
    let files =
        fetch_skill_files(client, &parsed.owner, &parsed.repo, &commit, &skill_path).await?;
    let manifest = manifest_from_files(&files)?;
    Ok(SkillDetail {
        id: format!("{}/{}/{}", parsed.owner, parsed.repo, manifest.name),
        source: format!("{}/{}", parsed.owner, parsed.repo),
        slug: manifest.name.clone(),
        name: manifest.name,
        description: manifest.description,
        license: manifest.license,
        installs: 0,
        github_stars: None,
        url: parsed.canonical_url,
        skill_path: Some(skill_path),
        audits: Vec::new(),
        version: Some(commit),
        files,
    })
}

async fn candidate_at(
    client: &GitHubClient,
    parsed: &GitHubUrlResult,
    reference: &str,
    commit: &str,
    skill_path: &str,
) -> Result<UrlSkillCandidate, SkillsageError> {
    let files = fetch_skill_files(client, &parsed.owner, &parsed.repo, commit, skill_path).await?;
    let manifest = manifest_from_files(&files)?;
    Ok(UrlSkillCandidate {
        name: manifest.name,
        description: manifest.description,
        skill_path: skill_path.to_string(),
        url: format!(
            "https://github.com/{}/{}/tree/{}/{}",
            parsed.owner, parsed.repo, reference, skill_path
        ),
    })
}

async fn resolve_reference(
    client: &GitHubClient,
    parsed: &GitHubUrlResult,
) -> Result<String, SkillsageError> {
    if parsed.skill_path.is_none() && parsed.commit == "main" {
        client.get_default_branch(&parsed.owner, &parsed.repo).await
    } else {
        Ok(parsed.commit.clone())
    }
}

fn manifest_from_files(
    files: &[SkillFile],
) -> Result<crate::core::skill::model::SkillManifest, SkillsageError> {
    let skill_md = files
        .iter()
        .find(|file| file.path.eq_ignore_ascii_case("SKILL.md"))
        .ok_or_else(|| SkillsageError::InvalidSkill("技能目录缺少 SKILL.md".into()))?;
    let contents = std::str::from_utf8(&skill_md.contents).map_err(|error| {
        SkillsageError::InvalidSkill(format!("SKILL.md 不是有效的 UTF-8 文本：{error}"))
    })?;
    Ok(parse_skill_md(contents)?.manifest)
}
