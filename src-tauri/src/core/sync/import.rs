use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::core::paths;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::skill::parser::is_valid_skill_name;
use crate::core::tools::detection::detect_tools;
use crate::core::tools::registry::find_tool;
use crate::error::SkillsageError;

use super::export::{SyncPackage, SyncSkillEntry, FORMAT_VERSION};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncToolPreview {
    pub id: String,
    pub name: String,
    pub detected: bool,
    pub requested: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSkillPreview {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: String,
    pub current_version: String,
    pub distributed_to: Vec<String>,
    pub installed: bool,
    pub tools: Vec<SyncToolPreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncImportPreview {
    pub path: String,
    pub exported_at: String,
    pub skills: Vec<SyncSkillPreview>,
}

pub fn load(path: &str) -> Result<SyncPackage, SkillsageError> {
    let path = Path::new(path);
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| SkillsageError::SyncInvalid(format!("无法读取同步清单: {error}")))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(SkillsageError::SyncInvalid(format!(
            "同步清单不存在: {}",
            path.display()
        )));
    }
    if metadata.len() > 8 * 1024 * 1024 {
        return Err(SkillsageError::SyncInvalid(
            "同步清单超过 8 MiB，已拒绝读取".into(),
        ));
    }
    let content = std::fs::read_to_string(path)
        .map_err(|error| SkillsageError::SyncInvalid(error.to_string()))?;
    let package: SyncPackage = serde_json::from_str(&content)
        .map_err(|error| SkillsageError::SyncInvalid(error.to_string()))?;
    validate(&package)?;
    Ok(package)
}

pub fn preview_at(layout: &RepoLayout, path: &str) -> Result<SyncImportPreview, SkillsageError> {
    let package = load(path)?;
    let lock = lockfile::load(layout)?;
    let detected = detect_tools()?.tools;
    let skills = package
        .skills
        .iter()
        .map(|entry| SyncSkillPreview {
            id: entry.id.clone(),
            name: entry.name.clone(),
            description: entry.description.clone(),
            source: entry.source.clone(),
            current_version: entry.current_version.clone(),
            distributed_to: entry.distributed_to.clone(),
            installed: lock.skills.contains_key(&entry.id)
                || lock.skills.values().any(|record| record.name == entry.name),
            tools: detected
                .iter()
                .map(|tool| SyncToolPreview {
                    id: tool.id.clone(),
                    name: tool.name.clone(),
                    detected: tool.detected,
                    requested: entry.distributed_to.iter().any(|id| id == &tool.id),
                })
                .collect(),
        })
        .collect();
    Ok(SyncImportPreview {
        path: paths::display(&PathBuf::from(path)),
        exported_at: package.exported_at,
        skills,
    })
}

pub fn selected_entries(
    package: &SyncPackage,
    selected_ids: &[String],
) -> Result<Vec<SyncSkillEntry>, SkillsageError> {
    let selected: Vec<String> = if selected_ids.is_empty() {
        package
            .skills
            .iter()
            .map(|entry| entry.id.clone())
            .collect()
    } else {
        selected_ids.to_vec()
    };
    let mut entries = Vec::new();
    let mut seen = HashSet::new();
    for id in selected {
        if !seen.insert(id.clone()) {
            continue;
        }
        let entry = package
            .skills
            .iter()
            .find(|entry| entry.id == id)
            .cloned()
            .ok_or_else(|| SkillsageError::SyncInvalid(format!("清单中不存在技能: {id}")))?;
        entries.push(entry);
    }
    Ok(entries)
}

pub fn agents_for(
    entry: &SyncSkillEntry,
    choices: &BTreeMap<String, Vec<String>>,
    detected: &[String],
) -> Vec<String> {
    choices.get(&entry.id).cloned().unwrap_or_else(|| {
        entry
            .distributed_to
            .iter()
            .filter(|id| detected.iter().any(|detected_id| detected_id == *id))
            .cloned()
            .collect()
    })
}

fn validate(package: &SyncPackage) -> Result<(), SkillsageError> {
    if package.format_version != FORMAT_VERSION {
        return Err(SkillsageError::SyncInvalid(format!(
            "不支持的清单版本: {}",
            package.format_version
        )));
    }
    if package.skills.len() > 1000 {
        return Err(SkillsageError::SyncInvalid("清单中的技能数量过多".into()));
    }
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    for entry in &package.skills {
        if entry.id.is_empty()
            || entry.id.len() > 512
            || !entry
                .id
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "/_-".contains(character))
            || !is_valid_skill_name(&entry.name)
            || !ids.insert(entry.id.clone())
            || !names.insert(entry.name.clone())
            || entry.owner.is_empty()
            || !is_safe_component(&entry.owner)
            || entry.repo.is_empty()
            || !is_safe_component(&entry.repo)
            || entry.current_version.is_empty()
            || !is_safe_reference(&entry.current_version)
            || entry.current_hash.is_empty()
            || !is_allowed_source(&entry.source)
        {
            return Err(SkillsageError::SyncInvalid(format!(
                "技能条目无效: {}",
                entry.id
            )));
        }
        if entry.distributed_to.len() > 32 {
            return Err(SkillsageError::SyncInvalid(format!(
                "技能分发目标过多: {}",
                entry.name
            )));
        }
        let mut tools = HashSet::new();
        for agent in &entry.distributed_to {
            if !tools.insert(agent) || find_tool(agent).is_err() {
                return Err(SkillsageError::SyncInvalid(format!(
                    "技能包含无效的分发目标: {}",
                    entry.name
                )));
            }
        }
        if let Some(skill_path) = &entry.skill_path {
            validate_skill_path(skill_path)?;
        }
    }
    Ok(())
}

fn is_safe_component(value: &str) -> bool {
    value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
}

fn is_safe_reference(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && !value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '/')
        })
}

fn is_allowed_source(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.username().is_empty()
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && matches!(
            url.host_str(),
            Some("skills.sh")
                | Some("www.skills.sh")
                | Some("github.com")
                | Some("www.github.com")
                | Some("raw.githubusercontent.com")
        )
}

fn validate_skill_path(value: &str) -> Result<(), SkillsageError> {
    if value.is_empty()
        || value.contains('\\')
        || value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(SkillsageError::SyncInvalid(format!(
            "技能路径无效: {value}"
        )));
    }
    Ok(())
}
