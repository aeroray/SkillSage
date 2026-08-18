use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::core::url_install::parser;

#[derive(Debug, Clone)]
pub struct LegacyRemoteSource {
    pub owner: String,
    pub repo: String,
    pub source: String,
    pub version: String,
}

pub fn find_legacy_remote(home: &Path, name: &str) -> Option<LegacyRemoteSource> {
    for path in candidate_lock_paths(home) {
        let Ok(content) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&content) else {
            continue;
        };
        if let Some(source) = find_in_value(&value, name) {
            return Some(source);
        }
    }
    None
}

fn candidate_lock_paths(home: &Path) -> Vec<PathBuf> {
    [
        home.join(".agents/skills-lock.json"),
        home.join(".agents/.skills-lock.json"),
        home.join(".agents/skill-lock.json"),
        home.join(".agents/skills/.skill-lock.json"),
        home.join(".agents/skills/skills-lock.json"),
    ]
    .into_iter()
    .collect()
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
    Some(LegacyRemoteSource {
        owner,
        repo,
        source: source.to_string(),
        version: parsed.commit,
    })
    .filter(|_| !name.is_empty())
}
