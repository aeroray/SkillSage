use serde::Deserialize;

use crate::error::SkillsageError;

use super::super::limits::MAX_GITHUB_TREE_ENTRIES;
use super::client::GitHubClient;

#[derive(Debug, Clone, Deserialize)]
pub struct GitTreeResponse {
    pub sha: String,
    pub tree: Vec<GitTreeEntry>,
    #[serde(default)]
    pub truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitTreeEntry {
    pub path: String,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub sha: Option<String>,
}

pub async fn find_skill_files(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
) -> Result<Vec<String>, SkillsageError> {
    validate_skill_path(skill_path)?;
    let tree = client.get_tree(owner, repo, commit).await?;
    if tree.truncated {
        return Err(SkillsageError::ResponseTooLarge(
            "GitHub 仓库目录过大，API 返回了不完整的目录树".into(),
        ));
    }
    if tree.tree.len() > MAX_GITHUB_TREE_ENTRIES {
        return Err(SkillsageError::ResponseTooLarge(format!(
            "GitHub 仓库目录超过 {MAX_GITHUB_TREE_ENTRIES} 个条目"
        )));
    }
    let prefix = skill_path.trim_matches('/');
    let exact_skill_file = if prefix.is_empty() {
        "SKILL.md".to_string()
    } else {
        format!("{prefix}/SKILL.md")
    };
    let skill_file = if tree
        .tree
        .iter()
        .any(|entry| entry.path == exact_skill_file && entry.entry_type == "blob")
    {
        exact_skill_file
    } else {
        let leaf = prefix.rsplit('/').next().unwrap_or(prefix);
        let aliases = [
            leaf,
            leaf.split_once('-')
                .map(|(_, suffix)| suffix)
                .unwrap_or(leaf),
        ];
        tree.tree
            .iter()
            .filter(|entry| entry.entry_type == "blob" && entry.path.ends_with("/SKILL.md"))
            .find(|entry| {
                entry
                    .path
                    .strip_suffix("/SKILL.md")
                    .and_then(|parent| parent.rsplit('/').next())
                    .map(|parent| aliases.contains(&parent))
                    .unwrap_or(false)
            })
            .map(|entry| entry.path.clone())
            .ok_or_else(|| SkillsageError::PathNotFound(exact_skill_file.clone().into()))?
    };
    let actual_prefix = skill_file.strip_suffix("/SKILL.md").unwrap_or("");
    tree.tree
        .into_iter()
        .filter(|entry| {
            entry.entry_type == "blob"
                && (entry.path == skill_file
                    || entry.path.starts_with(&format!("{actual_prefix}/")))
        })
        .map(|entry| {
            validate_tree_path(&entry.path)?;
            Ok(entry.path)
        })
        .collect()
}

fn validate_skill_path(value: &str) -> Result<(), SkillsageError> {
    let normalized = value.trim_matches('/');
    if normalized.is_empty() {
        return Ok(());
    }
    if normalized.contains('\\')
        || normalized
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(SkillsageError::InvalidGithubUrl(
            "技能路径包含不安全片段".into(),
        ));
    }
    Ok(())
}

fn validate_tree_path(value: &str) -> Result<(), SkillsageError> {
    if value.is_empty() || value.starts_with('/') || value.contains('\\') {
        return Err(SkillsageError::InvalidGithubUrl(
            "GitHub 文件路径包含不安全片段".into(),
        ));
    }
    if value
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(SkillsageError::InvalidGithubUrl(
            "GitHub 文件路径包含不安全片段".into(),
        ));
    }
    Ok(())
}
