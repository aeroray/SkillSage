use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::SkillsageError;

use super::layout::RepoLayout;

/// The infix `conflict::take_over` puts in a renamed-aside backup.
pub const BACKUP_INFIX: &str = ".skillsage-backup-";

/// True for an entry this app created as a backup or temp artifact, and which
/// is therefore never a skill the user could adopt or manage.
///
/// Two naming schemes exist and both must be recognizable from the name alone,
/// because a crash between a rename-aside and its `finalize()` leaves the
/// artifact sitting in a directory other code scans:
///
/// - `{name}.skillsage-backup-{ts}-{pid}` — `conflict::take_over`.
/// - `.{name}.{dir-backup|file-backup}-{pid}-{nanos}` — `unique_backup_path`.
///
/// The first is not dot-prefixed and the second is, so a filter written against
/// only one shape silently admits the other. The checks are anchored to those
/// exact suffixes rather than a loose `contains("-backup-")`, so an unrelated
/// directory a user happens to have named `...-backup-...` is still listed.
pub fn is_managed_artifact(name: &str) -> bool {
    if name.contains(BACKUP_INFIX) {
        return true;
    }
    name.starts_with('.')
        && (name.contains(".dir-backup-") || name.contains(".file-backup-"))
}

pub fn create_temp_dir(layout: &RepoLayout) -> Result<PathBuf, SkillsageError> {
    layout.ensure_roots()?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| SkillsageError::Io(error.to_string()))?
        .as_nanos();
    let path = layout
        .tmp_root()
        .join(format!("install-{}-{timestamp}", std::process::id()));
    // `create_dir`, not `create_dir_all`: a same-nanosecond collision would
    // otherwise silently succeed on the existing path and let two installs
    // share (and cross-contaminate) one temp tree.
    match std::fs::create_dir(&path) {
        Ok(()) => Ok(path),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            Err(SkillsageError::Io(format!(
                "临时目录已存在，拒绝复用: {}",
                path.display()
            )))
        }
        Err(error) => Err(error.into()),
    }
}

/// Removes leftover temp directories from a previous run. Cleanup on the error
/// paths is best-effort, so a crash or a failed `?` can leave partial trees
/// under `~/.skillsage/tmp` indefinitely.
pub fn sweep_temp_dirs(layout: &RepoLayout) -> Result<usize, SkillsageError> {
    let tmp_root = layout.tmp_root();
    if !tmp_root.is_dir() {
        return Ok(0);
    }
    let mut removed = 0;
    for entry in std::fs::read_dir(&tmp_root)? {
        let entry = entry?;
        let path = entry.path();
        // Only remove entries we created, and never follow a link out of tmp.
        let name = entry.file_name();
        if !name.to_string_lossy().starts_with("install-") {
            continue;
        }
        match remove_dir(&path) {
            Ok(()) => removed += 1,
            Err(error) => {
                tracing::warn!(error = %error, path = %path.display(), "无法清理临时目录");
            }
        }
    }
    Ok(removed)
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

/// What the caller expects to find at the replacement destination, based on
/// the conflict check it already performed. This closes the window between
/// that check and the rename: without it, a foreign directory created in
/// between would be renamed aside and then deleted by `finalize()`, destroying
/// user data that the takeover path exists to preserve.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DestinationState {
    /// The slot was verified empty; anything here now is an unexpected conflict.
    Empty,
    /// A directory SkillSage manages is expected and will be replaced.
    Managed,
}

pub fn replace_dir_transaction(
    temp_dir: &Path,
    destination: &Path,
    expected: DestinationState,
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
        Ok(_) if expected == DestinationState::Empty => {
            // The conflict check said this slot was free. A directory that
            // appeared since then belongs to someone else; refuse rather than
            // rename-and-delete it.
            return Err(SkillsageError::InstallConflict(format!(
                "安装目标路径在检查后已被占用: {}",
                destination.display()
            )));
        }
        Ok(_) => {
            std::fs::rename(destination, &backup)?;
            previous = Some(backup.clone());
        }
        // A missing destination is fine either way: for `Managed` the caller is
        // repairing a record whose directory disappeared, and for `Empty` it is
        // the expected state.
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

/// Removes a path that may be a directory, a file, or a link, refusing only
/// links (which are never ours to delete here). Used for the renamed-aside
/// backups created by takeover: the displaced entry can be a stray *file*
/// sitting at the target name, which `remove_dir_all` cannot delete — leaving
/// `<name>.skillsage-backup-<ts>` accumulating on disk forever.
pub fn remove_path(path: &Path) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(SkillsageError::Io(format!(
            "拒绝删除符号链接: {}",
            path.display()
        ))),
        Ok(metadata) if metadata.is_dir() => std::fs::remove_dir_all(path).map_err(Into::into),
        Ok(_) => std::fs::remove_file(path).map_err(Into::into),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
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

/// Creates `path` and any missing parents inside a temp tree, cleaning the tree
/// up on failure. A bare `create_dir_all(...)?` leaks the whole temp directory:
/// a GitHub tree may legally contain a name the local filesystem rejects
/// (`foo?`, `bar*`, `a:b` on Windows), so this is reachable without a crash.
pub fn create_dir_in_temp(
    temp_dir: &Path,
    path: &Path,
) -> Result<(), SkillsageError> {
    if let Some(parent) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            let _ = remove_dir(temp_dir);
            return Err(error.into());
        }
    }
    Ok(())
}

/// Writes a file inside a temp tree, cleaning the tree up on failure.
pub fn write_file_in_temp(
    temp_dir: &Path,
    path: &Path,
    contents: &[u8],
) -> Result<(), SkillsageError> {
    if let Err(error) = std::fs::write(path, contents) {
        let _ = remove_dir(temp_dir);
        return Err(error.into());
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::{is_managed_artifact, remove_path, replace_dir_transaction, DestinationState};
    use crate::error::SkillsageError;
    use std::fs;

    #[test]
    fn recognizes_both_backup_naming_schemes() {
        // `conflict::take_over` — not dot-prefixed.
        assert!(is_managed_artifact("notes-helper.skillsage-backup-1700000000-4242"));
        // `unique_backup_path` — dot-prefixed, different infix.
        assert!(is_managed_artifact(".notes-helper.dir-backup-4242-1700000000"));
        assert!(is_managed_artifact(".config.json.file-backup-4242-1700000000"));
        // Real skills are untouched by the filter.
        assert!(!is_managed_artifact("notes-helper"));
        assert!(!is_managed_artifact("my-skill"));
        // A dotfile that is not ours stays visible.
        assert!(!is_managed_artifact(".gitignore"));
        // A user directory that merely mentions "backup" is still a skill.
        assert!(!is_managed_artifact("my-backup-notes"));
        assert!(!is_managed_artifact("db-backup-helper"));
    }

    fn test_root(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "skillsage-atomic-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create test root");
        root
    }

    #[test]
    fn refuses_to_replace_a_directory_that_appeared_after_the_empty_check() {
        // Simulates the TOCTOU window: the conflict check saw an empty slot,
        // then a foreign directory appeared. It must be refused, not renamed
        // aside and deleted.
        let root = test_root("toctou");
        let temp = root.join("temp");
        let destination = root.join("skill");
        fs::create_dir_all(&temp).expect("create temp");
        fs::write(temp.join("SKILL.md"), "new").expect("write temp file");
        fs::create_dir_all(&destination).expect("create foreign dir");
        fs::write(destination.join("user-data.txt"), "precious").expect("write user data");

        let result = replace_dir_transaction(&temp, &destination, DestinationState::Empty);
        assert!(matches!(
            result,
            Err(SkillsageError::InstallConflict(_))
        ));
        // The foreign content must be untouched.
        assert!(destination.join("user-data.txt").is_file());
        assert!(temp.join("SKILL.md").is_file());

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn replaces_a_managed_directory_when_one_is_expected() {
        let root = test_root("managed");
        let temp = root.join("temp");
        let destination = root.join("skill");
        fs::create_dir_all(&temp).expect("create temp");
        fs::write(temp.join("SKILL.md"), "new").expect("write temp file");
        fs::create_dir_all(&destination).expect("create managed dir");
        fs::write(destination.join("old.txt"), "old").expect("write old file");

        let replacement =
            replace_dir_transaction(&temp, &destination, DestinationState::Managed)
                .expect("managed replacement should succeed");
        assert!(destination.join("SKILL.md").is_file());
        replacement.finalize().expect("finalize should succeed");
        assert!(!destination.join("old.txt").exists());

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn remove_path_deletes_a_file_that_remove_dir_cannot() {
        // A stray file at the target name is renamed aside by takeover; the
        // backup must be deletable or it leaks permanently.
        let root = test_root("remove-path");
        let file = root.join("stray.txt");
        fs::write(&file, "stray").expect("write stray file");
        remove_path(&file).expect("remove_path should delete a file");
        assert!(!file.exists());

        let dir = root.join("dir");
        fs::create_dir_all(dir.join("nested")).expect("create nested");
        fs::write(dir.join("nested/file.txt"), "x").expect("write nested file");
        remove_path(&dir).expect("remove_path should delete a directory tree");
        assert!(!dir.exists());

        // A missing path is not an error.
        remove_path(&root.join("absent")).expect("missing path should be fine");

        fs::remove_dir_all(root).expect("remove test root");
    }
}
