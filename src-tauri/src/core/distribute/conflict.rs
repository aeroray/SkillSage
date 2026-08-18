use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::skill::parser::read_skill_md;
use crate::core::tools::registry::find_tool;
use crate::error::SkillsageError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionConflict {
    pub tool_id: String,
    pub tool_name: String,
    pub path: String,
    pub kind: String,
}

pub fn find_for_skill(
    layout: &RepoLayout,
    skill_name: &str,
    agents: &[String],
) -> Result<Vec<DistributionConflict>, SkillsageError> {
    let central = canonical_or_self(&layout.root);
    let mut conflicts = Vec::new();
    for agent in agents {
        let tool = find_tool(agent)?;
        let path = tool.skills_path()?.join(skill_name);
        if !path_exists(&path) {
            continue;
        }
        let resolved = canonical_or_self(&path);
        if is_under(&resolved, &central) {
            continue;
        }
        conflicts.push(DistributionConflict {
            tool_id: tool.id.to_string(),
            tool_name: tool.name.to_string(),
            path: path.display().to_string(),
            kind: if is_link_like(&path) {
                "link"
            } else {
                "directory"
            }
            .into(),
        });
    }
    Ok(conflicts)
}

pub fn takeover_at(
    layout: &RepoLayout,
    conflict: &DistributionConflict,
    requested_name: &str,
) -> Result<String, SkillsageError> {
    let target = PathBuf::from(&conflict.path);
    let source = canonical_or_self(&target);
    let parsed = read_skill_md(&source.join("SKILL.md")).map_err(|_| {
        SkillsageError::DistributionConflict(format!("{} 不是可接管的技能目录", target.display()))
    })?;
    let mut lock = lockfile::load(layout)?;
    let base = if parsed.manifest.name == requested_name {
        format!("{}-migrated", parsed.manifest.name)
    } else {
        parsed.manifest.name.clone()
    };
    let adopted_name = unique_name(&lock, &base);
    let destination = layout.local_skill(&adopted_name)?;
    let current_hash = lockfile::content_hash(&source)?;
    layout.ensure_roots()?;
    let linked_source = is_link_like(&target);
    if linked_source {
        copy_dir(&source, &destination)?;
        crate::core::distribute::link::remove_link(&target)?;
    } else {
        std::fs::rename(&target, &destination)?;
    }

    let tool = find_tool(&conflict.tool_id)?;
    let adopted_link = tool.skills_path()?.join(&adopted_name);
    if let Err(error) = crate::core::distribute::link::create_link(&destination, &adopted_link) {
        let _ = crate::core::distribute::link::remove_link(&adopted_link);
        if linked_source {
            let _ = crate::core::distribute::link::create_link(&source, &target);
            let _ = std::fs::remove_dir_all(&destination);
        } else {
            let _ = std::fs::rename(&destination, &target);
        }
        return Err(error);
    }
    let record = lockfile::SkillLockRecord {
        id: format!("local/{adopted_name}"),
        name: adopted_name.clone(),
        owner: "local".into(),
        repo: "local".into(),
        skill_path: None,
        source: format!("local://{adopted_name}"),
        current_version: "migrated-conflict".into(),
        current_hash,
        distributed_to: vec![conflict.tool_id.clone()],
        installed_at: lockfile::unix_timestamp(),
        version_history: Vec::new(),
        description: parsed.manifest.description,
    };
    lock.skills.insert(record.id.clone(), record);
    if let Err(error) = lockfile::save(layout, &lock) {
        let _ = crate::core::distribute::link::remove_link(&adopted_link);
        if linked_source {
            let _ = crate::core::distribute::link::create_link(&source, &target);
            let _ = std::fs::remove_dir_all(&destination);
        } else {
            let _ = std::fs::rename(&destination, &target);
        }
        return Err(error);
    }
    Ok(adopted_name)
}

fn unique_name(lock: &lockfile::SkillLockFile, base: &str) -> String {
    if !lock.skills.values().any(|record| record.name == base) {
        return base.to_string();
    }
    for index in 2..1000 {
        let candidate = format!("{base}-{index}");
        if !lock.skills.values().any(|record| record.name == candidate) {
            return candidate;
        }
    }
    format!("{base}-{}", lockfile::unix_timestamp())
}

fn copy_dir(source: &Path, destination: &Path) -> Result<(), SkillsageError> {
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            std::fs::create_dir_all(&destination_path)?;
            copy_dir(&source_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(source_path, destination_path)?;
        }
    }
    Ok(())
}

fn path_exists(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

fn is_link_like(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
        || std::fs::read_link(path).is_ok()
}

fn canonical_or_self(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn normalize(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn is_under(path: &Path, root: &Path) -> bool {
    let path = normalize(path);
    let root = normalize(root);
    path == root || path.starts_with(&format!("{root}/"))
}
