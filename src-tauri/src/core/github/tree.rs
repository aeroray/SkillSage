use serde::Deserialize;

use crate::error::SkillsageError;

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
    let tree = client.get_tree(owner, repo, commit).await?;
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
    Ok(tree
        .tree
        .into_iter()
        .filter(|entry| {
            entry.entry_type == "blob"
                && (entry.path == skill_file
                    || entry.path.starts_with(&format!("{actual_prefix}/")))
        })
        .map(|entry| entry.path)
        .collect())
}
