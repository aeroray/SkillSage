use serde::{Deserialize, Serialize};

use crate::core::distribute::tracker::LinkTracker;
use crate::core::import::source as import_source;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::skill::parser::read_skill_md;
use crate::core::tools::registry::find_tool;
use crate::error::SkillsageError;

use super::scanner::{scan, MigrateItem};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateSelection {
    pub source_path: String,
    #[serde(default)]
    pub agents: Vec<String>,
    pub target_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateFailure {
    pub source_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateResult {
    pub migrated: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<MigrateFailure>,
}

pub fn execute_at(
    layout: &RepoLayout,
    selections: Vec<MigrateSelection>,
) -> Result<MigrateResult, SkillsageError> {
    let scan = scan(layout)?;
    let mut result = MigrateResult {
        migrated: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
    };
    for selection in selections {
        let Some(item) = scan
            .items
            .iter()
            .find(|item| item.source_path == selection.source_path)
        else {
            result.failed.push(MigrateFailure {
                source_path: selection.source_path,
                reason: "扫描结果中不存在该条目，可能已被移动".into(),
            });
            continue;
        };
        if !item.can_takeover {
            result.skipped.push(item.name.clone());
            continue;
        }
        match migrate_item(layout, item, &selection) {
            Ok(name) => result.migrated.push(name),
            Err(error) => result.failed.push(MigrateFailure {
                source_path: item.source_path.clone(),
                reason: error.to_string(),
            }),
        }
    }
    Ok(result)
}

fn migrate_item(
    layout: &RepoLayout,
    item: &MigrateItem,
    selection: &MigrateSelection,
) -> Result<String, SkillsageError> {
    let source = std::path::PathBuf::from(&item.source_path);
    import_source::validate_tree(&source)?;
    let parsed = read_skill_md(&source.join("SKILL.md"))?;
    let target_name = selection
        .target_name
        .clone()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| parsed.manifest.name.clone());
    if !crate::core::skill::parser::is_valid_skill_name(&target_name) {
        return Err(SkillsageError::MigrateFailed(
            "目标技能名称必须是 kebab-case".into(),
        ));
    }
    let mut agents = if selection.agents.is_empty() {
        item.tool_ids.clone()
    } else {
        selection.agents.clone()
    };
    agents.sort();
    agents.dedup();
    for agent in &agents {
        find_tool(agent)?;
    }

    let mut lock = lockfile::load(layout)?;
    if lock
        .skills
        .values()
        .any(|record| record.name == target_name)
    {
        return Err(SkillsageError::NameConflict(format!(
            "技能名称已被中央仓库占用: {target_name}"
        )));
    }
    let is_remote = item.classification == "remote"
        && item.remote_owner.is_some()
        && item.remote_repo.is_some();
    let destination = if is_remote {
        layout.remote_skill(
            item.remote_owner.as_deref().unwrap_or("legacy"),
            &target_name,
        )?
    } else {
        layout.local_skill(&target_name)?
    };
    if destination.exists() {
        return Err(SkillsageError::NameConflict(format!(
            "中央仓库目标已存在: {}",
            destination.display()
        )));
    }
    let current_hash = lockfile::content_hash(&source)?;
    layout.ensure_roots()?;
    if let Err(error) = std::fs::rename(&source, &destination) {
        return Err(SkillsageError::MigrateFailed(format!(
            "无法移动 {}: {}",
            source.display(),
            error
        )));
    }

    let mut tracker = LinkTracker::default();
    for agent in &agents {
        let tool = find_tool(agent)?;
        if let Err(error) = tracker.create(&destination, tool.skills_path()?.join(&target_name)) {
            tracker.rollback();
            let _ = std::fs::rename(&destination, &source);
            return Err(error);
        }
    }
    let id = if is_remote {
        format!(
            "{}/{}",
            item.remote_owner.as_deref().unwrap_or("legacy"),
            target_name
        )
    } else {
        format!("local/{target_name}")
    };
    let record = lockfile::SkillLockRecord {
        id: id.clone(),
        name: target_name.clone(),
        owner: if is_remote {
            item.remote_owner.clone().unwrap_or_else(|| "legacy".into())
        } else {
            "local".into()
        },
        repo: if is_remote {
            item.remote_repo.clone().unwrap_or_else(|| "legacy".into())
        } else {
            "local".into()
        },
        skill_path: if is_remote {
            item.remote_skill_path.clone()
        } else {
            None
        },
        source: if is_remote {
            item.remote_source.clone().unwrap_or_else(|| {
                format!(
                    "https://github.com/{}/{}",
                    item.remote_owner.as_deref().unwrap_or("legacy"),
                    item.remote_repo.as_deref().unwrap_or("legacy")
                )
            })
        } else {
            format!("local://{target_name}")
        },
        current_version: if is_remote {
            item.remote_version
                .clone()
                .unwrap_or_else(|| "migrated".into())
        } else {
            "migrated".into()
        },
        current_hash,
        distributed_to: agents,
        installed_at: lockfile::unix_timestamp(),
        version_history: Vec::new(),
        description: parsed.manifest.description,
    };
    lock.skills.insert(id, record);
    if let Err(error) = lockfile::save(layout, &lock) {
        tracker.rollback();
        let _ = std::fs::rename(&destination, &source);
        return Err(error);
    }
    Ok(target_name)
}
