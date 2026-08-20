use serde::{Deserialize, Serialize};

use crate::core::repo::{atomic, layout::RepoLayout, lockfile};
use crate::error::SkillsageError;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CleanupMode {
    All,
    KeepSkills,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub mode: CleanupMode,
    /// Real folders removed from the shared public directory (`All` mode
    /// only, and only ones SkillSage's lock file actually tracked — an
    /// untracked neighbor is never touched). Every AI tool that reads skills
    /// from that directory loses access to these immediately; there is no
    /// per-tool granularity or undo the way removing a link used to have.
    pub tracked_skills_removed: usize,
    pub management_data_removed: bool,
}

pub fn cleanup_at(layout: &RepoLayout, mode: CleanupMode) -> Result<CleanupResult, SkillsageError> {
    ensure_managed_root(layout)?;
    match mode {
        CleanupMode::All => {
            let lock = lockfile::load(layout)?;
            let mut removed = 0;
            let mut failures = Vec::new();
            for record in lock.skills.values() {
                let result = layout
                    .skill(&record.name)
                    .and_then(|path| atomic::remove_dir(&path));
                match result {
                    Ok(()) => removed += 1,
                    Err(error) => failures.push(error.to_string()),
                }
            }
            if !failures.is_empty() {
                return Err(SkillsageError::CleanupFailed(format_failures(&failures)));
            }
            atomic::remove_dir(&layout.root)?;
            Ok(CleanupResult {
                mode,
                tracked_skills_removed: removed,
                management_data_removed: true,
            })
        }
        CleanupMode::KeepSkills => {
            // Nothing under the private root needs selective preservation
            // any more: root holds only the lock file, snapshots, tmp, and
            // settings — never skill content — so this mode now leaves every
            // file in the shared public directory completely untouched,
            // safer than the old per-subpath dance that had to dodge
            // remote/local content while still deleting links.
            atomic::remove_dir(&layout.root)?;
            Ok(CleanupResult {
                mode,
                tracked_skills_removed: 0,
                management_data_removed: true,
            })
        }
    }
}

fn ensure_managed_root(layout: &RepoLayout) -> Result<(), SkillsageError> {
    let Ok(metadata) = std::fs::symlink_metadata(&layout.root) else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() {
        return Err(SkillsageError::CleanupFailed(format!(
            "中央仓库路径是符号链接，为避免误删外部目录已停止: {}",
            layout.root.display()
        )));
    }
    if !metadata.is_dir() {
        return Err(SkillsageError::CleanupFailed(format!(
            "中央仓库路径不是目录: {}",
            layout.root.display()
        )));
    }
    Ok(())
}

fn format_failures(failures: &[String]) -> String {
    failures
        .iter()
        .take(5)
        .cloned()
        .collect::<Vec<_>>()
        .join("；")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{cleanup_at, CleanupMode};
    use crate::core::repo::{layout::RepoLayout, lockfile};

    fn test_layout(name: &str) -> RepoLayout {
        let root =
            std::env::temp_dir().join(format!("skillsage-cleanup-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        RepoLayout::new(root.join("central"), root.join("public"))
    }

    fn record(name: &str) -> lockfile::SkillLockRecord {
        lockfile::SkillLockRecord {
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
    fn full_cleanup_removes_only_tracked_skills_and_management_data() {
        let layout = test_layout("all");
        layout.ensure_roots().expect("create layout");
        let tracked = layout.skill("tracked").expect("path should resolve");
        fs::create_dir_all(&tracked).expect("write tracked skill");
        let untracked = layout.skill("untracked").expect("path should resolve");
        fs::create_dir_all(&untracked).expect("write untracked skill");
        let mut lock = lockfile::SkillLockFile::default();
        lock.skills
            .insert("local/tracked".into(), record("tracked"));
        lockfile::save(&layout, &lock).expect("save lock");

        let result = cleanup_at(&layout, CleanupMode::All).expect("cleanup should succeed");
        assert_eq!(result.tracked_skills_removed, 1);
        assert!(!layout.root.exists());
        assert!(!tracked.exists());
        assert!(
            untracked.exists(),
            "cleanup must never touch a folder it doesn't track"
        );

        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }

    #[test]
    fn keep_mode_leaves_every_public_directory_file_untouched() {
        let layout = test_layout("keep");
        layout.ensure_roots().expect("create layout");
        let skill = layout.skill("kept-skill").expect("path should resolve");
        fs::create_dir_all(&skill).expect("write skill");
        fs::write(skill.join("SKILL.md"), "content").expect("write skill file");
        fs::write(layout.settings_path(), "{}").expect("write settings");
        lockfile::save(&layout, &lockfile::SkillLockFile::default()).expect("write lock");

        let result = cleanup_at(&layout, CleanupMode::KeepSkills).expect("cleanup should succeed");
        assert_eq!(result.tracked_skills_removed, 0);
        assert!(!layout.root.exists());
        assert!(skill.join("SKILL.md").is_file());

        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }

    #[test]
    fn rejects_a_symlinked_repository_root() {
        let layout = test_layout("symlink");
        #[cfg(unix)]
        {
            let outside = layout.root.with_file_name("skillsage-cleanup-outside");
            let _ = fs::remove_dir_all(&outside);
            fs::create_dir_all(&outside).expect("create outside");
            fs::create_dir_all(layout.root.parent().expect("root parent"))
                .expect("create root parent");
            std::os::unix::fs::symlink(&outside, &layout.root).expect("create root symlink");

            assert!(cleanup_at(&layout, CleanupMode::All).is_err());
            assert!(outside.is_dir());
            let _ = fs::remove_file(&layout.root);
            fs::remove_dir_all(outside).expect("remove outside");
        }

        #[cfg(windows)]
        {
            fs::create_dir_all(layout.root.parent().expect("root parent")).expect("create parent");
            fs::write(&layout.root, "not a directory").expect("create invalid root");
            assert!(cleanup_at(&layout, CleanupMode::All).is_err());
            fs::remove_file(&layout.root).expect("remove invalid root");
        }
    }
}
