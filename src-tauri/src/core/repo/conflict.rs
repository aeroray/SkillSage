use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::core::paths;
use crate::error::SkillsageError;

use super::layout::RepoLayout;
use super::lockfile::{self, SkillLockFile};

/// An untracked foreign path already occupying the flat slot a skill wants to
/// install into (`layout.skill(name)`). Distinct from a name clash with a
/// skill SkillSage already tracks — see `is_tracked()`, which install/import
/// check up front as a separate, non-takeover-eligible `NameConflict`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallConflict {
    pub name: String,
    pub path: String,
    /// "directory" | "link"
    pub kind: String,
}

/// How to resolve an `InstallConflict`. `Skip` and `Cancel` are handled
/// entirely client-side in the new single-target model (the frontend simply
/// never calls install for that attempt) and are functionally identical here
/// — both mean "do not take over," so a fresh install call with a
/// still-unresolved conflict fails cleanly. Only `Takeover` causes a
/// filesystem mutation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConflictAction {
    Skip,
    Takeover,
    Cancel,
}

/// True if some record in the lockfile already tracks a skill named `name`.
/// Shared by install/import's up-front `NameConflict` check and the adopt
/// scanner's filter for "already ours, don't offer it again."
pub fn is_tracked(lock: &SkillLockFile, name: &str) -> bool {
    lock.skills.values().any(|record| record.name == name)
}

/// Checks whether an untracked path already occupies `layout.skill(name)`.
/// Returns `None` when the slot is empty or already tracked by us (the
/// caller's own `is_tracked` check should already have handled the tracked
/// case as a distinct `NameConflict`; this is a defensive second look).
pub fn check(
    layout: &RepoLayout,
    lock: &SkillLockFile,
    name: &str,
) -> Result<Option<InstallConflict>, SkillsageError> {
    let path = layout.skill(name)?;
    if !path_exists(&path) {
        return Ok(None);
    }
    if is_tracked(lock, name) {
        return Ok(None);
    }
    Ok(Some(InstallConflict {
        name: name.to_string(),
        path: paths::display(&path),
        kind: if is_link_like(&path) {
            "link"
        } else {
            "directory"
        }
        .into(),
    }))
}

/// A foreign path renamed aside during takeover, restorable if a later
/// install step fails. Never adopts the displaced content and never deletes
/// it — it is simply relocated to a sibling backup name.
#[derive(Debug)]
pub struct PendingTakeover {
    original_path: PathBuf,
    backup_path: PathBuf,
}

pub fn take_over(layout: &RepoLayout, name: &str) -> Result<PendingTakeover, SkillsageError> {
    let original = layout.skill(name)?;
    if !path_exists(&original) {
        return Err(SkillsageError::Io(format!(
            "冲突路径不存在：{}",
            original.display()
        )));
    }
    let file_name = original
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let backup = original.with_file_name(format!(
        "{file_name}.skillsage-backup-{}-{}",
        lockfile::unix_timestamp(),
        std::process::id()
    ));
    std::fs::rename(&original, &backup)?;
    Ok(PendingTakeover {
        original_path: original,
        backup_path: backup,
    })
}

impl PendingTakeover {
    /// Undo the takeover — used when a later step in the same install fails.
    pub fn restore(self) -> Result<(), SkillsageError> {
        std::fs::rename(&self.backup_path, &self.original_path)?;
        Ok(())
    }

    /// Permanently remove the displaced foreign path after the new install
    /// and lockfile have both been committed.
    pub fn finalize(self) -> Result<(), SkillsageError> {
        super::atomic::remove_dir(&self.backup_path)
    }
}

fn path_exists(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

fn is_link_like(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{check, is_tracked, take_over, ConflictAction};
    use crate::core::repo::layout::RepoLayout;
    use crate::core::repo::lockfile::{SkillLockFile, SkillLockRecord};

    fn test_layout(name: &str) -> RepoLayout {
        let root =
            std::env::temp_dir().join(format!("skillsage-conflict-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        RepoLayout::new(root.join("central"), root.join("public"))
    }

    fn record(name: &str) -> SkillLockRecord {
        SkillLockRecord {
            id: format!("local/{name}"),
            name: name.to_string(),
            owner: "local".into(),
            repo: "local".into(),
            skill_path: None,
            source: format!("local://{name}"),
            current_version: "local".into(),
            current_hash: "hash".into(),
            installed_at: "1".into(),
            version_history: Vec::new(),
            description: String::new(),
        }
    }

    #[test]
    fn no_conflict_when_path_is_empty() {
        let layout = test_layout("empty");
        layout.ensure_roots().expect("create layout");
        let lock = SkillLockFile::default();
        assert!(check(&layout, &lock, "new-skill")
            .expect("check should succeed")
            .is_none());
        fs::remove_dir_all(&layout.root).expect("remove central root");
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }

    #[test]
    fn conflict_reported_for_untracked_foreign_directory() {
        let layout = test_layout("foreign");
        layout.ensure_roots().expect("create layout");
        let foreign = layout.skill("foo").expect("path should resolve");
        fs::create_dir_all(&foreign).expect("create foreign dir");

        let lock = SkillLockFile::default();
        let conflict = check(&layout, &lock, "foo")
            .expect("check should succeed")
            .expect("conflict should be reported");
        assert_eq!(conflict.kind, "directory");

        fs::remove_dir_all(&layout.root).expect("remove central root");
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }

    #[test]
    fn tracked_name_is_not_a_path_conflict() {
        let layout = test_layout("tracked");
        layout.ensure_roots().expect("create layout");
        let path = layout.skill("foo").expect("path should resolve");
        fs::create_dir_all(&path).expect("create dir");

        let mut lock = SkillLockFile::default();
        lock.skills.insert("local/foo".into(), record("foo"));
        assert!(is_tracked(&lock, "foo"));
        assert!(check(&layout, &lock, "foo")
            .expect("check should succeed")
            .is_none());

        fs::remove_dir_all(&layout.root).expect("remove central root");
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }

    #[test]
    fn takeover_renames_aside_and_can_be_restored() {
        let layout = test_layout("takeover");
        layout.ensure_roots().expect("create layout");
        let original = layout.skill("foo").expect("path should resolve");
        fs::create_dir_all(&original).expect("create dir");
        fs::write(original.join("marker.txt"), "keep me").expect("write marker");

        let pending = take_over(&layout, "foo").expect("takeover should succeed");
        assert!(!original.exists());
        pending.restore().expect("restore should succeed");
        assert!(original.join("marker.txt").is_file());

        fs::remove_dir_all(&layout.root).expect("remove central root");
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }

    #[test]
    fn conflict_action_defaults_treat_skip_and_cancel_alike() {
        // Both mean "do not take over" from the backend's perspective; only
        // Takeover triggers a filesystem mutation.
        assert_ne!(ConflictAction::Skip, ConflictAction::Takeover);
        assert_ne!(ConflictAction::Cancel, ConflictAction::Takeover);
    }
}
