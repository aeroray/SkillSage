use serde::Deserialize;

use crate::core::limits::{MAX_GITHUB_TREE_ENTRIES, MAX_REMOTE_SKILL_CANDIDATES};
use crate::core::skill::parser::parse_skill_md;
use crate::error::SkillsageError;

use super::client::GitHubClient;

#[derive(Debug, Clone, Deserialize)]
pub struct GitTreeResponse {
    pub tree: Vec<GitTreeEntry>,
    #[serde(default)]
    pub truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitTreeEntry {
    pub path: String,
    #[serde(rename = "type")]
    pub entry_type: String,
}

pub async fn find_skill_files(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
) -> Result<Vec<String>, SkillsageError> {
    find_skill_files_with_path(client, owner, repo, commit, skill_path)
        .await
        .map(|(_, files)| files)
}

pub async fn find_skill_files_with_path(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
) -> Result<(String, Vec<String>), SkillsageError> {
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
        let path_match = tree
            .tree
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
            .map(|entry| entry.path.clone());
        match path_match {
            Some(path) => path,
            None => {
                // skills.sh identifies a skill by its manifest name, which does not
                // always match the directory name in the source repository.
                // Resolve that mapping from SKILL.md when the path-based lookup fails.
                find_skill_file_by_manifest(
                    client,
                    owner,
                    repo,
                    commit,
                    &tree.tree,
                    prefix,
                    &exact_skill_file,
                )
                .await?
            }
        }
    };
    let actual_prefix = skill_file.strip_suffix("/SKILL.md").unwrap_or("");
    let files = tree
        .tree
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
        .collect::<Result<Vec<_>, SkillsageError>>()?;
    Ok((actual_prefix.to_string(), files))
}

async fn find_skill_file_by_manifest(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    tree: &[GitTreeEntry],
    requested_path: &str,
    exact_skill_file: &str,
) -> Result<String, SkillsageError> {
    let candidates = tree
        .iter()
        .filter(|entry| {
            entry.entry_type == "blob"
                && (entry.path == "SKILL.md" || entry.path.ends_with("/SKILL.md"))
                && validate_tree_path(&entry.path).is_ok()
        })
        .map(|entry| entry.path.clone())
        .collect::<Vec<_>>();
    if candidates.len() > MAX_REMOTE_SKILL_CANDIDATES {
        return Err(SkillsageError::ResponseTooLarge(format!(
            "仓库包含超过 {MAX_REMOTE_SKILL_CANDIDATES} 个可识别技能"
        )));
    }

    for candidate in candidates {
        let url = format!("https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{candidate}");
        let contents = client.get_text(&url).await?;
        let Ok(parsed) = parse_skill_md(&contents) else {
            continue;
        };
        if manifest_matches_skill_path(&parsed.manifest.name, requested_path) {
            return Ok(candidate);
        }
    }

    Err(SkillsageError::PathNotFound(exact_skill_file.into()))
}

fn manifest_matches_skill_path(manifest_name: &str, requested_path: &str) -> bool {
    let requested_name = requested_path.rsplit('/').next().unwrap_or(requested_path);
    manifest_name == requested_name || manifest_name == requested_path
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

#[cfg(test)]
mod tests {
    use super::manifest_matches_skill_path;

    #[test]
    fn matches_manifest_name_to_store_skill_path() {
        assert!(manifest_matches_skill_path(
            "redesign-existing-projects",
            "redesign-existing-projects"
        ));
        assert!(manifest_matches_skill_path(
            "redesign-existing-projects",
            "skills/redesign-existing-projects"
        ));
        assert!(!manifest_matches_skill_path(
            "redesign-skill",
            "redesign-existing-projects"
        ));
    }
}
