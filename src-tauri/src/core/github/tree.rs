use serde::Deserialize;
use std::sync::Arc;

use crate::core::limits::{MAX_GITHUB_TREE_ENTRIES, MAX_REMOTE_SKILL_CANDIDATES};
use crate::core::skill::parser::parse_skill_md;
use crate::error::SkillsageError;

use super::client::GitHubClient;

/// Cap on simultaneous per-candidate manifest probes. Mirrors the bounded
/// concurrency the file downloader uses so a repository with many candidate
/// skills cannot open an unbounded number of requests at once.
const MAX_CONCURRENT_MANIFEST_PROBES: usize = 8;

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

    // Probe candidates concurrently with bounded concurrency: this path runs
    // whenever a skill's manifest name differs from its directory name, and a
    // sequential loop could issue up to MAX_REMOTE_SKILL_CANDIDATES serial
    // round-trips. The original index is carried through so the earliest
    // matching candidate still wins, preserving the previous semantics.
    let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_MANIFEST_PROBES));
    let mut jobs = tokio::task::JoinSet::new();
    for (index, candidate) in candidates.into_iter().enumerate() {
        let client = client.clone();
        let owner = owner.to_string();
        let repo = repo.to_string();
        let commit = commit.to_string();
        let semaphore = semaphore.clone();
        jobs.spawn(async move {
            let _permit = semaphore
                .acquire_owned()
                .await
                .map_err(|error| SkillsageError::Task(error.to_string()))?;
            let url = format!("https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{candidate}");
            let contents = client.get_text(&url).await?;
            Ok::<_, SkillsageError>((index, candidate, contents))
        });
    }

    let mut matched: Option<(usize, String)> = None;
    while let Some(result) = jobs.join_next().await {
        let (index, candidate, contents) =
            result.map_err(|error| SkillsageError::Task(error.to_string()))??;
        let Ok(parsed) = parse_skill_md(&contents) else {
            continue;
        };
        // `map_or` rather than `is_none_or`, which postdates the crate's
        // pinned `rust-version`.
        if manifest_matches_skill_path(&parsed.manifest.name, requested_path)
            && matched
                .as_ref()
                .map_or(true, |(best, _)| index < *best)
        {
            matched = Some((index, candidate));
        }
    }

    match matched {
        Some((_, candidate)) => Ok(candidate),
        None => Err(SkillsageError::PathNotFound(exact_skill_file.into())),
    }
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
