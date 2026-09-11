use serde::Serialize;

use crate::core::repo::{atomic, layout::RepoLayout, lockfile};
use crate::core::skill::parser::read_skill_md;
use crate::core::store::models::SkillFile;
use crate::error::SkillsageError;

use super::remote;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub id: String,
    pub current_version: String,
    pub current_hash: String,
    pub latest_version: String,
    pub latest_hash: String,
    pub update_available: bool,
}

pub async fn check(record: &lockfile::SkillLockRecord) -> Result<UpdateInfo, SkillsageError> {
    if !remote::is_remote_record(record) {
        return Ok(UpdateInfo {
            id: record.id.clone(),
            current_version: record.current_version.clone(),
            current_hash: record.current_hash.clone(),
            latest_version: record.current_version.clone(),
            latest_hash: record.current_hash.clone(),
            update_available: false,
        });
    }
    let (latest_version, files) = remote::fetch_latest(record).await?;
    let latest_hash = hash_files(&files)?;
    Ok(UpdateInfo {
        id: record.id.clone(),
        current_version: record.current_version.clone(),
        current_hash: record.current_hash.clone(),
        latest_version,
        update_available: latest_hash != record.current_hash,
        latest_hash,
    })
}

pub fn apply_at(
    layout: &RepoLayout,
    skill_id: &str,
    version: String,
    files: Vec<SkillFile>,
) -> Result<lockfile::SkillLockRecord, SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let current = lock
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;
    let next_hash = hash_files(&files)?;
    if next_hash == current.current_hash {
        return Ok(current);
    }

    layout.ensure_roots()?;
    let temp_dir = materialize(layout, &files)?;
    let parsed = match read_skill_md(&temp_dir.join("SKILL.md")) {
        Ok(value) => value,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };
    if parsed.manifest.name != current.name {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(SkillsageError::InvalidSkill(format!(
            "updated SKILL.md changed the skill name from {} to {}",
            current.name, parsed.manifest.name
        )));
    }

    let destination = layout.skill(&current.name)?;
    let replacement = match atomic::replace_dir_transaction(&temp_dir, &destination) {
        Ok(replacement) => replacement,
        Err(error) => {
            let recovery = atomic::remove_dir(&temp_dir).err();
            return Err(with_recovery(error, recovery));
        }
    };

    let mut next = current.clone();
    next.current_version = version;
    next.current_hash = next_hash;
    next.description = parsed.manifest.description;
    lock.skills.insert(skill_id.to_string(), next.clone());
    if let Err(error) = lockfile::save(layout, &lock) {
        return Err(with_recovery(error, replacement.rollback().err()));
    }
    if let Err(error) = replacement.finalize() {
        tracing::warn!(error = %error, "无法清理更新时生成的旧目录备份");
    }
    Ok(next)
}

fn with_recovery(primary: SkillsageError, recovery: Option<SkillsageError>) -> SkillsageError {
    match recovery {
        Some(recovery) => SkillsageError::Io(format!("{primary}; 恢复失败: {recovery}")),
        None => primary,
    }
}

fn materialize(
    layout: &RepoLayout,
    files: &[SkillFile],
) -> Result<std::path::PathBuf, SkillsageError> {
    let temp_dir = atomic::create_temp_dir(layout)?;
    for file in files {
        let relative = match safe_relative_path(&file.path) {
            Ok(value) => value,
            Err(error) => {
                let _ = atomic::remove_dir(&temp_dir);
                return Err(error);
            }
        };
        let target = temp_dir.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if let Err(error) = std::fs::write(target, &file.contents) {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error.into());
        }
    }
    Ok(temp_dir)
}

fn hash_files(files: &[SkillFile]) -> Result<String, SkillsageError> {
    for file in files {
        safe_relative_path(&file.path)?;
    }
    Ok(lockfile::content_hash_files(
        &files
            .iter()
            .map(|file| (file.path.replace('\\', "/"), file.contents.clone()))
            .collect::<Vec<_>>(),
    ))
}

fn safe_relative_path(value: &str) -> Result<std::path::PathBuf, SkillsageError> {
    let path = std::path::Path::new(value);
    if value.is_empty() || path.is_absolute() {
        return Err(SkillsageError::InvalidStoreData(format!(
            "unsafe skill file path: {value}"
        )));
    }
    let mut result = std::path::PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(value) => result.push(value),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir
            | std::path::Component::RootDir
            | std::path::Component::Prefix(_) => {
                return Err(SkillsageError::InvalidStoreData(format!(
                    "unsafe skill file path: {value}"
                )))
            }
        }
    }
    if result.as_os_str().is_empty() {
        return Err(SkillsageError::InvalidStoreData(format!(
            "unsafe skill file path: {value}"
        )));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::apply_at;
    use crate::core::lifecycle::install::install_test_skill_at;
    use crate::core::repo::{layout::RepoLayout, lockfile};
    use crate::core::store::models::SkillFile;

    #[test]
    fn update_replaces_content_without_history_or_snapshots() {
        let root = std::env::temp_dir().join(format!("skillsage-update-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");
        let next = r#"---
name: skillsage-phase2-test
description: Updated fixture.
license: MIT
---

# Updated
"#;
        let record = apply_at(
            &layout,
            "skillsage/skillsage-phase2-test",
            "commit-v2".to_string(),
            vec![SkillFile {
                path: "SKILL.md".to_string(),
                contents: next.as_bytes().to_vec(),
            }],
        )
        .expect("update should succeed");

        assert_eq!(record.current_version, "commit-v2");
        assert_eq!(
            record.current_hash,
            lockfile::content_hash(&layout.skill(&record.name).unwrap()).unwrap()
        );
        assert!(!layout.lock_root().join("snapshots").exists());
        assert_eq!(
            lockfile::load(&layout)
                .expect("lock should load")
                .skills
                .len(),
            1
        );
        fs::remove_dir_all(root).expect("remove test root");
    }
}
