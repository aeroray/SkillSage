use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::skill::parser::is_valid_skill_name;
use crate::core::tools::detection::detect_tools;
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
    if !path.is_file() {
        return Err(SkillsageError::SyncInvalid(format!(
            "同步清单不存在: {}",
            path.display()
        )));
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
        path: PathBuf::from(path).display().to_string(),
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
        selected_ids.iter().cloned().collect()
    };
    let mut entries = Vec::new();
    for id in selected {
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
    for entry in &package.skills {
        if entry.id.is_empty()
            || !is_valid_skill_name(&entry.name)
            || entry.owner.is_empty()
            || entry.owner.contains('/')
            || entry.repo.is_empty()
            || entry.repo.contains('/')
            || entry.current_version.is_empty()
            || !entry.source.starts_with("https://")
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
    }
    Ok(())
}
