use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::core::skill::parser::read_skill_md;
use crate::core::tools::registry::find_tool;
use crate::core::{
    distribute::link,
    import::source as import_source,
    paths,
    repo::{atomic, layout::RepoLayout, lockfile},
};
use crate::error::SkillsageError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionConflict {
    pub tool_id: String,
    pub tool_name: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug)]
pub struct TakeoverTransaction {
    record_id: String,
    target: PathBuf,
    source: PathBuf,
    destination: PathBuf,
    adopted_link: PathBuf,
    linked_source: bool,
}

pub fn rollback_takeovers(layout: &RepoLayout, transactions: Vec<TakeoverTransaction>) {
    for transaction in transactions.into_iter().rev() {
        let _ = transaction.rollback(layout);
    }
}

impl TakeoverTransaction {
    pub fn rollback(self, layout: &RepoLayout) -> Result<(), SkillsageError> {
        let mut first_error = None;
        if let Err(error) = link::remove_link(&self.adopted_link) {
            first_error = Some(error);
        }
        if self.linked_source {
            if let Err(error) = atomic::remove_dir(&self.destination) {
                first_error.get_or_insert(error);
            }
            if let Err(error) = link::create_link(&self.source, &self.target) {
                first_error.get_or_insert(error);
            }
        } else if let Err(error) = std::fs::rename(&self.destination, &self.target) {
            first_error.get_or_insert(error.into());
        }

        match lockfile::load(layout) {
            Ok(mut lock) => {
                lock.skills.remove(&self.record_id);
                if let Err(error) = lockfile::save(layout, &lock) {
                    first_error.get_or_insert(error);
                }
            }
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
        first_error.map_or(Ok(()), Err)
    }
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
            path: paths::display(&path),
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

pub fn takeover_at_transaction(
    layout: &RepoLayout,
    conflict: &DistributionConflict,
    requested_name: &str,
) -> Result<TakeoverTransaction, SkillsageError> {
    let target = PathBuf::from(&conflict.path);
    let source = canonical_or_self(&target);
    if !path_exists(&target) || !source.is_dir() {
        return Err(SkillsageError::DistributionConflict(format!(
            "冲突路径不存在或不是目录：{}",
            target.display()
        )));
    }
    let parsed = read_skill_md(&source.join("SKILL.md")).map_err(|_| {
        SkillsageError::DistributionConflict(format!("{} 不是可迁移的技能目录", target.display()))
    })?;
    import_source::validate_tree(&source)?;
    let mut lock = lockfile::load(layout)?;
    let base = if parsed.manifest.name == requested_name {
        format!("{}-migrated", parsed.manifest.name)
    } else {
        parsed.manifest.name.clone()
    };
    let adopted_name = unique_name(layout, &lock, &base)?;
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
    if let Err(error) = link::create_link(&destination, &adopted_link) {
        let _ = link::remove_link(&adopted_link);
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
    let record_id = record.id.clone();
    lock.skills.insert(record_id.clone(), record);
    if let Err(error) = lockfile::save(layout, &lock) {
        let transaction = TakeoverTransaction {
            record_id,
            target,
            source,
            destination,
            adopted_link,
            linked_source,
        };
        let _ = transaction.rollback(layout);
        return Err(error);
    }
    Ok(TakeoverTransaction {
        record_id,
        target,
        source,
        destination,
        adopted_link,
        linked_source,
    })
}

fn unique_name(
    layout: &RepoLayout,
    lock: &lockfile::SkillLockFile,
    base: &str,
) -> Result<String, SkillsageError> {
    if !lock.skills.values().any(|record| record.name == base)
        && !layout.local_skill(base)?.exists()
    {
        return Ok(base.to_string());
    }
    for index in 2..1000 {
        let candidate = format!("{base}-{index}");
        if !lock.skills.values().any(|record| record.name == candidate)
            && !layout.local_skill(&candidate)?.exists()
        {
            return Ok(candidate);
        }
    }
    Ok(format!("{base}-{}", lockfile::unix_timestamp()))
}

fn copy_dir(source: &Path, destination: &Path) -> Result<(), SkillsageError> {
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let metadata = std::fs::symlink_metadata(&source_path)?;
        if metadata.file_type().is_symlink() {
            return Err(SkillsageError::DistributionConflict(format!(
                "技能内容包含符号链接，无法安全迁移：{}",
                source_path.display()
            )));
        }
        let destination_path = destination.join(entry.file_name());
        if metadata.is_dir() {
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
