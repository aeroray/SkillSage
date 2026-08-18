use serde::Serialize;
use url::Url;

use crate::error::SkillsageError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUrlResult {
    pub owner: String,
    pub repo: String,
    pub skill_path: Option<String>,
    pub commit: String,
    pub canonical_url: String,
}

pub fn parse(raw: &str) -> Result<GitHubUrlResult, SkillsageError> {
    let raw = raw.trim();
    let lower = raw.to_ascii_lowercase();
    if lower.contains("%2e") || lower.contains("%2f") || lower.contains("%5c") {
        return Err(SkillsageError::InvalidGithubUrl(
            "地址包含编码后的不安全路径片段".into(),
        ));
    }
    let url =
        Url::parse(raw).map_err(|error| SkillsageError::InvalidGithubUrl(error.to_string()))?;
    let host = url
        .host_str()
        .ok_or_else(|| SkillsageError::InvalidGithubUrl("缺少 GitHub 主机名".into()))?;
    let segments = url
        .path_segments()
        .ok_or_else(|| SkillsageError::InvalidGithubUrl("GitHub 地址路径无效".into()))?
        .filter(|segment| !segment.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    if url.scheme() != "https" {
        return Err(SkillsageError::InvalidGithubUrl(
            "只支持 https:// GitHub 地址".into(),
        ));
    }

    let (owner, repo, commit, path) = if matches!(host, "github.com" | "www.github.com") {
        if segments.len() < 2 {
            return Err(SkillsageError::InvalidGithubUrl(
                "地址必须包含 owner 和 repository".into(),
            ));
        }
        let owner = segments[0].clone();
        let repo = segments[1].trim_end_matches(".git").to_string();
        let rest = &segments[2..];
        if rest.is_empty() {
            (owner, repo, "main".to_string(), Vec::new())
        } else if rest.len() >= 2 && matches!(rest[0].as_str(), "tree" | "blob") {
            if rest[1].is_empty() {
                return Err(SkillsageError::InvalidGithubUrl("缺少分支或 commit".into()));
            }
            (owner, repo, rest[1].clone(), rest[2..].to_vec())
        } else {
            return Err(SkillsageError::InvalidGithubUrl(
                "GitHub 地址应为仓库、tree、blob 或 SKILL.md 链接".into(),
            ));
        }
    } else if host == "raw.githubusercontent.com" {
        if segments.len() < 4 {
            return Err(SkillsageError::InvalidGithubUrl(
                "raw GitHub 地址缺少 owner、repository 或 commit".into(),
            ));
        }
        (
            segments[0].clone(),
            segments[1].trim_end_matches(".git").to_string(),
            segments[2].clone(),
            segments[3..].to_vec(),
        )
    } else {
        return Err(SkillsageError::InvalidGithubUrl(
            "只支持 github.com 或 raw.githubusercontent.com".into(),
        ));
    };

    validate_component(&owner, "owner")?;
    validate_component(&repo, "repository")?;
    validate_reference(&commit)?;
    for segment in &path {
        if segment == "." || segment == ".." || segment.contains('\\') {
            return Err(SkillsageError::InvalidGithubUrl(
                "路径包含不安全片段".into(),
            ));
        }
    }

    Ok(GitHubUrlResult {
        owner,
        repo,
        skill_path: skill_path_from_segments(&path),
        commit,
        canonical_url: url.to_string(),
    })
}

fn skill_path_from_segments(path: &[String]) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    if path.last().is_some_and(|segment| segment == "SKILL.md") {
        let parent = &path[..path.len() - 1];
        return Some(parent.join("/"));
    }
    Some(path.join("/"))
}

fn validate_component(value: &str, label: &str) -> Result<(), SkillsageError> {
    if value.is_empty()
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(SkillsageError::InvalidGithubUrl(format!(
            "{label} 包含不安全字符"
        )));
    }
    Ok(())
}

fn validate_reference(value: &str) -> Result<(), SkillsageError> {
    if value.is_empty()
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '/')
        })
    {
        return Err(SkillsageError::InvalidGithubUrl(
            "分支或 commit 包含不安全字符".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn parses_repository_tree_blob_and_raw_urls() {
        let repository = parse("https://github.com/acme/skills").expect("repository URL");
        assert_eq!(repository.owner, "acme");
        assert_eq!(repository.repo, "skills");
        assert_eq!(repository.skill_path, None);

        let tree =
            parse("https://github.com/acme/skills/tree/main/packages/research").expect("tree URL");
        assert_eq!(tree.commit, "main");
        assert_eq!(tree.skill_path.as_deref(), Some("packages/research"));

        let blob = parse("https://github.com/acme/skills/blob/v1/packages/research/SKILL.md")
            .expect("blob URL");
        assert_eq!(blob.commit, "v1");
        assert_eq!(blob.skill_path.as_deref(), Some("packages/research"));

        let raw =
            parse("https://raw.githubusercontent.com/acme/skills/v1/packages/research/SKILL.md")
                .expect("raw URL");
        assert_eq!(raw.skill_path.as_deref(), Some("packages/research"));
    }

    #[test]
    fn rejects_non_github_and_unsafe_urls() {
        assert!(parse("http://github.com/acme/skills").is_err());
        assert!(parse("https://github.com/acme/skills/blob/main/%2e%2e/SKILL.md").is_err());
        assert!(parse("https://example.com/acme/skills").is_err());
    }
}
