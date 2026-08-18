use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::SkillsageError;

use super::layout::RepoLayout;

pub fn create_temp_dir(layout: &RepoLayout) -> Result<PathBuf, SkillsageError> {
    layout.ensure_roots()?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| SkillsageError::Io(error.to_string()))?
        .as_nanos();
    let path = layout
        .tmp_root()
        .join(format!("install-{}-{timestamp}", std::process::id()));
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

pub fn commit_dir(temp_dir: &Path, destination: &Path) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(destination) {
        Ok(_) => {
            return Err(SkillsageError::AlreadyInstalled(
                destination.display().to_string(),
            ))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(temp_dir, destination)?;
    Ok(())
}

pub fn replace_dir(temp_dir: &Path, destination: &Path) -> Result<(), SkillsageError> {
    let backup = destination.with_extension(format!("backup-{}", std::process::id()));
    if std::fs::symlink_metadata(&backup).is_ok() {
        remove_dir(&backup)?;
    }
    match std::fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(SkillsageError::Io(format!(
                "中央技能目录不是受 SkillSage 管理的真实目录: {}",
                destination.display()
            )))
        }
        Ok(_) => std::fs::rename(destination, &backup)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    match std::fs::rename(temp_dir, destination) {
        Ok(()) => {
            if std::fs::symlink_metadata(&backup).is_ok() {
                remove_dir(&backup)?;
            }
            Ok(())
        }
        Err(error) => {
            if std::fs::symlink_metadata(destination).is_ok() {
                let _ = remove_dir(destination);
            }
            if std::fs::symlink_metadata(&backup).is_ok() {
                let _ = std::fs::rename(&backup, destination);
            }
            Err(error.into())
        }
    }
}

pub fn remove_dir(path: &Path) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(SkillsageError::Io(format!(
                "拒绝删除符号链接目录: {}",
                path.display()
            )))
        }
        Ok(_) => std::fs::remove_dir_all(path)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

pub fn replace_file(temporary_path: &Path, destination: &Path) -> Result<(), SkillsageError> {
    let temporary_metadata = std::fs::symlink_metadata(temporary_path)?;
    if temporary_metadata.file_type().is_symlink() || !temporary_metadata.is_file() {
        return Err(SkillsageError::Io(format!(
            "临时文件不是受 SkillSage 管理的普通文件: {}",
            temporary_path.display()
        )));
    }
    let backup = destination.with_extension(format!("backup-{}", std::process::id()));
    if std::fs::symlink_metadata(&backup).is_ok() {
        std::fs::remove_file(&backup)?;
    }

    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(temporary_path)?;
    use std::io::Write;
    file.flush()?;
    file.sync_all()?;
    drop(file);

    if std::fs::symlink_metadata(destination).is_ok() {
        std::fs::rename(destination, &backup)?;
    }
    match std::fs::rename(temporary_path, destination) {
        Ok(()) => {
            if std::fs::symlink_metadata(&backup).is_ok() {
                std::fs::remove_file(backup)?;
            }
            Ok(())
        }
        Err(error) => {
            if std::fs::symlink_metadata(destination).is_ok() {
                let _ = std::fs::remove_file(destination);
            }
            if std::fs::symlink_metadata(&backup).is_ok() {
                let _ = std::fs::rename(&backup, destination);
            }
            Err(error.into())
        }
    }
}
