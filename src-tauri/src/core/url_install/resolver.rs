use serde::Serialize;

use crate::core::github::{client::GitHubClient, download::fetch_skill_files};
use crate::core::limits::MAX_REMOTE_SKILL_CANDIDATES;
use crate::core::skill::parser::parse_skill_md;
use crate::core::store::models::{SkillDetail, SkillFile};
use crate::error::SkillsageError;

use super::parser::{parse, GitHubUrlResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlSkillCandidate {
    pub name: String,
    pub description: String,
    pub skill_path: String,
    pub url: String,
}

pub async fn resolve_skills(
    client: &GitHubClient,
    raw_url: &str,
) -> Result<(GitHubUrlResult, Vec<UrlSkillCandidate>), SkillsageError> {
    let parsed = parse(raw_url)?;
    let reference = resolve_reference(client, &parsed).await?;
    if let Some(skill_path) = &parsed.skill_path {
        let candidate = candidate_at(client, &parsed, &reference, skill_path).await?;
        return Ok((parsed, vec![candidate]));
    }

    let tree = client
        .get_tree(&parsed.owner, &parsed.repo, &reference)
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

    let mut candidates = Vec::with_capacity(paths.len());
    for path in paths {
        candidates.push(candidate_at(client, &parsed, &reference, &path).await?);
    }
    Ok((parsed, candidates))
}

pub async fn resolve_detail(
    client: &GitHubClient,
    raw_url: &str,
    selected_path: Option<String>,
) -> Result<SkillDetail, SkillsageError> {
    let parsed = parse(raw_url)?;
    let skill_path = selected_path.or(parsed.skill_path.clone()).ok_or_else(|| {
        SkillsageError::InvalidGithubUrl("仓库地址未指定技能，请先选择仓库中的技能".into())
    })?;
    let reference = resolve_reference(client, &parsed).await?;
    let commit = client
        .get_commit_sha(&parsed.owner, &parsed.repo, &reference)
        .await?;
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
    skill_path: &str,
) -> Result<UrlSkillCandidate, SkillsageError> {
    let commit = client
        .get_commit_sha(&parsed.owner, &parsed.repo, reference)
        .await?;
    let files = fetch_skill_files(client, &parsed.owner, &parsed.repo, &commit, skill_path).await?;
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
    Ok(parse_skill_md(&skill_md.contents)?.manifest)
}
