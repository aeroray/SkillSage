use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::error::SkillsageError;

pub const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPackage {
    pub format_version: u32,
    pub exported_at: String,
    pub skills: Vec<SyncSkillEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSkillEntry {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub repo: String,
    #[serde(default)]
    pub skill_path: Option<String>,
    pub source: String,
    pub current_version: String,
    pub current_hash: String,
    pub distributed_to: Vec<String>,
    pub description: String,
}

impl SyncSkillEntry {
    pub fn from_record(record: &lockfile::SkillLockRecord) -> Self {
        Self {
            id: record.id.clone(),
            name: record.name.clone(),
            owner: record.owner.clone(),
            repo: record.repo.clone(),
            skill_path: record.skill_path.clone(),
            source: record.source.clone(),
            current_version: record.current_version.clone(),
            current_hash: record.current_hash.clone(),
            distributed_to: record.distributed_to.clone(),
            description: record.description.clone(),
        }
    }
}

pub fn export_at(layout: &RepoLayout) -> Result<PathBuf, SkillsageError> {
    let lock = lockfile::load(layout)?;
    let skills = lock
        .skills
        .values()
        .filter(|record| {
            record.source.starts_with("https://")
                && !record.owner.is_empty()
                && !record.repo.is_empty()
        })
        .map(SyncSkillEntry::from_record)
        .collect::<Vec<_>>();
    let package = SyncPackage {
        format_version: FORMAT_VERSION,
        exported_at: lockfile::unix_timestamp(),
        skills,
    };

    layout.ensure_roots()?;
    let path = layout
        .exports_root()
        .join(format!("skillsage-sync-{}.json", package.exported_at));
    let content = serde_json::to_string_pretty(&package)?;
    std::fs::write(&path, format!("{content}\n"))
        .map_err(|error| SkillsageError::ExportFailed(error.to_string()))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{export_at, SyncPackage, FORMAT_VERSION};
    use crate::core::repo::{layout::RepoLayout, lockfile};

    #[test]
    fn exports_remote_records_but_excludes_local_records() {
        let root =
            std::env::temp_dir().join(format!("skillsage-sync-export-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let layout = RepoLayout::new(root.clone());
        let mut lock = lockfile::SkillLockFile::default();
        lock.skills.insert(
            "acme/skill".into(),
            lockfile::SkillLockRecord {
                id: "acme/skill".into(),
                name: "skill".into(),
                owner: "acme".into(),
                repo: "skills".into(),
                skill_path: Some("skill".into()),
                source: "https://github.com/acme/skills/tree/main/skill".into(),
                current_version: "abc123".into(),
                current_hash: "hash".into(),
                distributed_to: Vec::new(),
                installed_at: "1".into(),
                version_history: Vec::new(),
                description: "Remote".into(),
            },
        );
        lock.skills.insert(
            "local/local-skill".into(),
            lockfile::SkillLockRecord {
                id: "local/local-skill".into(),
                name: "local-skill".into(),
                owner: "local".into(),
                repo: "local".into(),
                skill_path: None,
                source: "local://local-skill".into(),
                current_version: "local".into(),
                current_hash: "hash".into(),
                distributed_to: Vec::new(),
                installed_at: "1".into(),
                version_history: Vec::new(),
                description: "Local".into(),
            },
        );
        lockfile::save(&layout, &lock).expect("save lock");

        let path = export_at(&layout).expect("export should succeed");
        let package: SyncPackage =
            serde_json::from_str(&fs::read_to_string(path).expect("read package"))
                .expect("parse package");
        assert_eq!(package.format_version, FORMAT_VERSION);
        assert_eq!(package.skills.len(), 1);
        assert_eq!(package.skills[0].name, "skill");
        fs::remove_dir_all(root).expect("remove test root");
    }
}
