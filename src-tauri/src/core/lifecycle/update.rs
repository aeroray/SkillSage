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
    let snapshot = layout
        .snapshot_skill(&current.name)?
        .join(&current.current_hash);
    match std::fs::symlink_metadata(&snapshot) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(SkillsageError::Io(format!(
                "快照路径不能是符号链接: {}",
                snapshot.display()
            )));
        }
        Ok(metadata) if !metadata.is_dir() => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(SkillsageError::Io(format!(
                "快照路径不是目录: {}",
                snapshot.display()
            )));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if let Some(parent) = snapshot.parent() {
                std::fs::create_dir_all(parent)?;
            }
            copy_dir(&destination, &snapshot)?;
        }
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error.into());
        }
    }
    if let Err(error) = atomic::replace_dir(&temp_dir, &destination) {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(error);
    }

    let mut next = current.clone();
    next.current_version = version;
    next.current_hash = next_hash;
    next.description = parsed.manifest.description;
    if !next
        .version_history
        .iter()
        .any(|entry| entry.commit == current.current_version && entry.hash == current.current_hash)
    {
        next.version_history.push(lockfile::VersionRecord {
            commit: current.current_version,
            hash: current.current_hash,
            recorded_at: lockfile::unix_timestamp(),
        });
    }
    lock.skills.insert(skill_id.to_string(), next.clone());
    if let Err(error) = lockfile::save(layout, &lock) {
        let _ = atomic::remove_dir(&destination);
        let _ = std::fs::create_dir_all(&destination);
        let _ = copy_dir(&snapshot, &destination);
        return Err(error);
    }
    Ok(next)
}

pub fn snapshot_files_at(
    layout: &RepoLayout,
    record: &lockfile::SkillLockRecord,
    hash: &str,
) -> Result<Vec<SkillFile>, SkillsageError> {
    let root = layout.snapshot_skill(&record.name)?.join(hash);
    match std::fs::symlink_metadata(&root) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        _ => return Err(SkillsageError::PathNotFound(root)),
    }
    let mut files = Vec::new();
    collect_snapshot_files(&root, &root, &mut files)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
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

fn copy_dir(source: &std::path::Path, destination: &std::path::Path) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(source) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
        _ => return Err(SkillsageError::PathNotFound(source.to_path_buf())),
    }
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let metadata = std::fs::symlink_metadata(&source_path)?;
        if metadata.file_type().is_symlink() {
            return Err(SkillsageError::Io(format!(
                "技能快照不能包含符号链接: {}",
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

fn collect_snapshot_files(
    root: &std::path::Path,
    current: &std::path::Path,
    files: &mut Vec<SkillFile>,
) -> Result<(), SkillsageError> {
    for entry in std::fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            return Err(SkillsageError::Io(format!(
                "技能快照不能包含符号链接: {}",
                path.display()
            )));
        }
        if metadata.is_dir() {
            collect_snapshot_files(root, &path, files)?;
        } else if metadata.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| SkillsageError::Io(error.to_string()))?
                .to_string_lossy()
                .replace('\\', "/");
            files.push(SkillFile {
                path: relative,
                contents: std::fs::read_to_string(path)?,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{apply_at, snapshot_files_at};
    use crate::core::lifecycle::install::install_test_skill_at;
    use crate::core::repo::{layout::RepoLayout, lockfile};
    use crate::core::store::models::SkillFile;

    #[test]
    fn update_records_history_and_creates_snapshot() {
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
                contents: next.to_string(),
            }],
        )
        .expect("update should succeed");

        assert_eq!(record.current_version, "commit-v2");
        assert_eq!(record.version_history.len(), 1);
        let snapshot = snapshot_files_at(&layout, &record, &record.version_history[0].hash)
            .expect("snapshot should be readable");
        assert_eq!(snapshot[0].path, "SKILL.md");
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
