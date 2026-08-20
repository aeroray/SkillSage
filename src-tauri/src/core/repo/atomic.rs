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

#[cfg(test)]
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
    rename_or_copy(temp_dir, destination)?;
    Ok(())
}

/// Replaces a directory while keeping the previous directory available until
/// the caller has committed its metadata. This makes filesystem and lockfile
/// updates recoverable as one operation.
pub struct DirectoryReplacement {
    destination: PathBuf,
    backup: Option<PathBuf>,
}

impl DirectoryReplacement {
    pub fn finalize(self) -> Result<(), SkillsageError> {
        if let Some(backup) = self.backup {
            remove_dir(&backup)?;
        }
        Ok(())
    }

    pub fn rollback(self) -> Result<(), SkillsageError> {
        if path_exists(&self.destination) {
            remove_dir(&self.destination)?;
        }
        if let Some(backup) = self.backup {
            std::fs::rename(&backup, &self.destination)?;
        }
        Ok(())
    }
}

pub fn replace_dir_transaction(
    temp_dir: &Path,
    destination: &Path,
) -> Result<DirectoryReplacement, SkillsageError> {
    let backup = unique_backup_path(destination, "dir-backup")?;
    let mut previous = None;
    match std::fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(SkillsageError::Io(format!(
                "中央技能目录不是受 SkillSage 管理的真实目录: {}",
                destination.display()
            )))
        }
        Ok(_) => {
            std::fs::rename(destination, &backup)?;
            previous = Some(backup.clone());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    match rename_or_copy(temp_dir, destination) {
        Ok(()) => Ok(DirectoryReplacement {
            destination: destination.to_path_buf(),
            backup: previous,
        }),
        Err(error) => {
            let cleanup = if path_exists(destination) {
                remove_dir(destination)
            } else {
                Ok(())
            };
            let restore = if let Some(backup) = previous {
                std::fs::rename(backup, destination).map_err(SkillsageError::from)
            } else {
                Ok(())
            };
            let cleanup_error = cleanup.err();
            let restore_error = restore.err();
            if let Some(recovery) = cleanup_error.or(restore_error) {
                return Err(SkillsageError::Io(format!(
                    "目录替换失败: {error}; 恢复失败: {recovery}"
                )));
            }
            Err(error)
        }
    }
}

/// `std::fs::rename`, falling back to a recursive copy-then-remove when the
/// source and destination are on different volumes. Under the old layout,
/// `temp_dir` (private root) and every commit/replace destination were both
/// under `~/.skillsage`, so a same-volume rename was structurally guaranteed.
/// Now the destination lives under the separate `~/.agents/skills` public
/// root, so that guarantee no longer holds in general (e.g. if `~/.agents`
/// turns out to be a different mount/drive) — this keeps the operation
/// correct in that rarer case at the cost of a real copy instead of an
/// instant rename.
fn rename_or_copy(source: &Path, destination: &Path) -> Result<(), SkillsageError> {
    match std::fs::rename(source, destination) {
        Ok(()) => Ok(()),
        Err(error) if is_cross_device(&error) => {
            copy_tree(source, destination)?;
            std::fs::remove_dir_all(source)?;
            Ok(())
        }
        Err(error) => Err(error.into()),
    }
}

fn is_cross_device(error: &std::io::Error) -> bool {
    match error.raw_os_error() {
        // EXDEV on Unix, ERROR_NOT_SAME_DEVICE on Windows. Checked via the
        // raw OS error code rather than `ErrorKind::CrossesDevices`, which
        // postdates this crate's pinned `rust-version`.
        Some(18) if cfg!(unix) => true,
        Some(17) if cfg!(windows) => true,
        _ => false,
    }
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), SkillsageError> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let metadata = std::fs::symlink_metadata(&source_path)?;
        if metadata.file_type().is_symlink() {
            return Err(SkillsageError::Io(format!(
                "内容不能包含符号链接: {}",
                source_path.display()
            )));
        }
        let destination_path = destination.join(entry.file_name());
        if metadata.is_dir() {
            copy_tree(&source_path, &destination_path)?;
        } else {
            std::fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
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
    match std::fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(SkillsageError::Io(format!(
                "目标文件不能是符号链接: {}",
                destination.display()
            )))
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err(SkillsageError::Io(format!(
                "目标路径不是普通文件: {}",
                destination.display()
            )))
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    let backup = unique_backup_path(destination, "file-backup")?;

    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(temporary_path)?;
    use std::io::Write;
    file.flush()?;
    file.sync_all()?;
    drop(file);

    match std::fs::symlink_metadata(destination) {
        Ok(_) => std::fs::rename(destination, &backup)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    match std::fs::rename(temporary_path, destination) {
        Ok(()) => {
            if std::fs::symlink_metadata(&backup).is_ok() {
                if let Err(error) = std::fs::remove_file(&backup) {
                    return Err(SkillsageError::Io(format!(
                        "文件已替换，但无法清理备份 {}: {error}",
                        backup.display()
                    )));
                }
            }
            Ok(())
        }
        Err(error) => {
            let cleanup = match std::fs::symlink_metadata(destination) {
                Ok(metadata) if metadata.file_type().is_symlink() => Err(SkillsageError::Io(
                    "替换失败后的目标路径变成了符号链接".into(),
                )),
                Ok(metadata) if metadata.is_file() => {
                    std::fs::remove_file(destination).map_err(SkillsageError::from)
                }
                Ok(_) => Err(SkillsageError::Io("替换失败后的目标路径不是文件".into())),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(error.into()),
            };
            let restore = if std::fs::symlink_metadata(&backup).is_ok() {
                std::fs::rename(&backup, destination).map_err(SkillsageError::from)
            } else {
                Ok(())
            };
            let cleanup_error = cleanup.err();
            let restore_error = restore.err();
            match cleanup_error.or(restore_error) {
                None => Err(error.into()),
                Some(recovery) => Err(SkillsageError::Io(format!(
                    "文件替换失败: {error}; 恢复失败: {recovery}"
                ))),
            }
        }
    }
}

pub fn write_file(destination: &Path, content: &[u8]) -> Result<(), SkillsageError> {
    if let Some(parent) = destination.parent() {
        match std::fs::symlink_metadata(parent) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(SkillsageError::Io(format!(
                    "导出目录不是受信任的真实目录: {}",
                    parent.display()
                )))
            }
            Ok(_) => {}
            Err(error) => return Err(error.into()),
        }
    }
    let temporary = destination.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| SkillsageError::Io(error.to_string()))?
            .as_nanos()
    ));
    if path_exists(&temporary) {
        return Err(SkillsageError::Io(format!(
            "临时文件已存在，拒绝覆盖: {}",
            temporary.display()
        )));
    }
    std::fs::write(&temporary, content)?;
    if let Err(error) = replace_file(&temporary, destination) {
        let cleanup = remove_file(&temporary);
        return match cleanup {
            Ok(()) => Err(error),
            Err(cleanup) => Err(SkillsageError::Io(format!(
                "写入文件失败: {error}; 清理临时文件失败: {cleanup}"
            ))),
        };
    }
    Ok(())
}

fn remove_file(path: &Path) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => Err(
            SkillsageError::Io(format!("临时路径不是普通文件: {}", path.display())),
        ),
        Ok(_) => std::fs::remove_file(path).map_err(SkillsageError::from),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn path_exists(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

fn unique_backup_path(destination: &Path, suffix: &str) -> Result<PathBuf, SkillsageError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| SkillsageError::Io(error.to_string()))?
        .as_nanos();
    let base = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("managed");
    let path = destination.with_file_name(format!(
        ".{base}.{suffix}-{}-{timestamp}",
        std::process::id()
    ));
    if path_exists(&path) {
        return Err(SkillsageError::Io(format!(
            "备份路径已存在，拒绝覆盖: {}",
            path.display()
        )));
    }
    Ok(path)
}
