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
    let skill_file = format!("{prefix}/SKILL.md");
    if !tree
        .tree
        .iter()
        .any(|entry| entry.path == skill_file && entry.entry_type == "blob")
    {
        return Err(SkillsageError::PathNotFound(skill_file.into()));
    }
    Ok(tree
        .tree
        .into_iter()
        .filter(|entry| {
            entry.entry_type == "blob"
                && (entry.path == skill_file || entry.path.starts_with(&format!("{prefix}/")))
        })
        .map(|entry| entry.path)
        .collect())
}
