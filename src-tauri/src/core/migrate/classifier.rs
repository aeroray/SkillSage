use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::core::url_install::parser;

#[derive(Debug, Clone)]
pub struct LegacyRemoteSource {
    pub owner: String,
    pub repo: String,
    pub source: String,
    pub version: String,
    pub skill_path: Option<String>,
}

pub fn find_legacy_remote(home: &Path, name: &str) -> Option<LegacyRemoteSource> {
    for path in candidate_lock_paths(home) {
        let Ok(content) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&content) else {
            continue;
        };
        if let Some(source) =
            find_current_lock_entry(&value, name).or_else(|| find_in_value(&value, name))
        {
            return Some(source);
        }
    }
    None
}

fn candidate_lock_paths(home: &Path) -> Vec<PathBuf> {
    let mut paths = vec![
        home.join(".agents/skills-lock.json"),
        home.join(".agents/.skills-lock.json"),
        home.join(".agents/skill-lock.json"),
        home.join(".agents/skills/.skill-lock.json"),
        home.join(".agents/skills/skills-lock.json"),
    ];
    if let Some(state_home) = std::env::var_os("XDG_STATE_HOME") {
        paths.insert(0, PathBuf::from(state_home).join("skills/.skill-lock.json"));
    }
    paths
}

fn find_current_lock_entry(value: &Value, name: &str) -> Option<LegacyRemoteSource> {
    let entry = value.get("skills")?.as_object()?.get(name)?.as_object()?;
    if entry
        .get("sourceType")
        .and_then(Value::as_str)
        .is_some_and(|kind| !kind.eq_ignore_ascii_case("github"))
    {
        return None;
    }

    let source = entry.get("source").and_then(Value::as_str);
    let source_url = entry.get("sourceUrl").and_then(Value::as_str);
    let (owner, repo, canonical_url) = parse_github_source(source_url, source)?;
    let skill_path = entry
        .get("skillPath")
        .and_then(Value::as_str)
        .and_then(normalize_skill_path);
    let version = entry
        .get("ref")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    Some(LegacyRemoteSource {
        owner,
        repo,
        source: canonical_url,
        version,
        skill_path,
    })
}

fn parse_github_source(
    source_url: Option<&str>,
    source: Option<&str>,
) -> Option<(String, String, String)> {
    if let Some(source_url) = source_url {
        if let Ok(parsed) = parser::parse(source_url) {
            return Some((parsed.owner, parsed.repo, parsed.canonical_url));
        }
    }
    let source = source?.trim().trim_end_matches('/');
    let mut parts = source.split('/');
    let owner = parts.next()?;
    let repo = parts.next()?.trim_end_matches(".git");
    if owner.is_empty() || repo.is_empty() || parts.next().is_some() {
        return None;
    }
    let url = format!("https://github.com/{owner}/{repo}");
    let parsed = parser::parse(&url).ok()?;
    Some((parsed.owner, parsed.repo, parsed.canonical_url))
}

fn normalize_skill_path(value: &str) -> Option<String> {
    let trimmed = value.trim_matches('/');
    let normalized = trimmed.strip_suffix("/SKILL.md").unwrap_or(trimmed);
    (!normalized.is_empty()).then(|| normalized.to_string())
}

fn find_in_value(value: &Value, name: &str) -> Option<LegacyRemoteSource> {
    match value {
        Value::Object(object) => {
            let name_matches = ["name", "skill", "slug", "skillName"]
                .iter()
                .filter_map(|key| object.get(*key))
                .any(|value| value.as_str() == Some(name));
            if name_matches {
                for value in object.values() {
                    if let Some(source) = github_source(value, name) {
                        return Some(source);
                    }
                }
            }
            object.values().find_map(|value| find_in_value(value, name))
        }
        Value::Array(values) => values.iter().find_map(|value| find_in_value(value, name)),
        _ => None,
    }
}

fn github_source(value: &Value, name: &str) -> Option<LegacyRemoteSource> {
    let source = value.as_str()?;
    let start = source.find("https://github.com/")?;
    let source = source[start..]
        .split(['"', '\'', ' ', '\n', '\r'])
        .next()?
        .trim_end_matches('/');
    let parsed = parser::parse(source).ok()?;
    let owner = parsed.owner;
    let repo = parsed.repo;
    (!name.is_empty()).then_some(LegacyRemoteSource {
        owner,
        repo,
        source: source.to_string(),
        version: parsed.commit,
        skill_path: parsed.skill_path,
    })
}

#[cfg(test)]
mod tests {
    use super::find_current_lock_entry;

    #[test]
    fn reads_the_current_global_npx_lock_shape() {
        let value = serde_json::json!({
            "version": 3,
            "skills": {
                "brainstorming": {
                    "source": "obra/superpowers",
                    "sourceType": "github",
                    "sourceUrl": "https://github.com/obra/superpowers.git",
                    "ref": "main",
                    "skillPath": "skills/brainstorming/SKILL.md",
                    "skillFolderHash": "tree-sha"
                }
            }
        });

        let source = find_current_lock_entry(&value, "brainstorming")
            .expect("current lock entry should be recognized");
        assert_eq!(source.owner, "obra");
        assert_eq!(source.repo, "superpowers");
        assert_eq!(source.version, "main");
        assert_eq!(source.skill_path.as_deref(), Some("skills/brainstorming"));
    }

    #[test]
    fn ignores_non_github_lock_entries() {
        let value = serde_json::json!({
            "skills": {
                "local-skill": {
                    "source": "C:/skills/local-skill",
                    "sourceType": "local"
                }
            }
        });
        assert!(find_current_lock_entry(&value, "local-skill").is_none());
    }
}
