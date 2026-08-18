use serde::{Deserialize, Serialize};

use crate::core::{
    distribute::link,
    repo::{atomic, layout::RepoLayout, lockfile},
    tools::registry::find_tool,
};
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
    pub removed_links: usize,
    pub central_removed: bool,
    pub management_data_removed: bool,
}

pub fn cleanup_at(layout: &RepoLayout, mode: CleanupMode) -> Result<CleanupResult, SkillsageError> {
    ensure_managed_root(layout)?;
    let lock = lockfile::load(layout)?;
    let mut removed_links = 0;
    let mut failures = Vec::new();

    for record in lock.skills.values() {
        for agent in &record.distributed_to {
            let result = find_tool(agent).and_then(|tool| {
                let target = tool.skills_path()?.join(&record.name);
                link::remove_link(&target).map(|()| target)
            });
            match result {
                Ok(_) => removed_links += 1,
                Err(error) => failures.push(error.to_string()),
            }
        }
    }

    if !failures.is_empty() {
        return Err(SkillsageError::CleanupFailed(format_failures(&failures)));
    }

    match mode {
        CleanupMode::All => {
            atomic::remove_dir(&layout.root)?;
            Ok(CleanupResult {
                mode,
                removed_links,
                central_removed: true,
                management_data_removed: true,
            })
        }
        CleanupMode::KeepSkills => {
            // Existing links point into the central repository. Removing that
            // repository would leave dangling links, so this mode preserves
            // skill content and links while removing SkillSage metadata.
            atomic::remove_dir(&layout.lock_root())?;
            atomic::remove_dir(&layout.tmp_root())?;
            atomic::remove_dir(&layout.exports_root())?;
            remove_file_if_present(&layout.settings_path())?;
            Ok(CleanupResult {
                mode,
                removed_links: 0,
                central_removed: false,
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

fn remove_file_if_present(path: &std::path::Path) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(SkillsageError::CleanupFailed(format!(
                "拒绝删除符号链接文件: {}",
                path.display()
            )))
        }
        Ok(_) => std::fs::remove_file(path).map_err(|error| {
            SkillsageError::CleanupFailed(format!("{}: {error}", path.display()))
        })?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(SkillsageError::CleanupFailed(format!(
                "{}: {error}",
                path.display()
            )))
        }
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
        RepoLayout::new(root)
    }

    #[test]
    fn removes_all_managed_data_for_full_cleanup() {
        let layout = test_layout("all");
        layout.ensure_roots().expect("create layout");
        fs::write(layout.remote_root().join("sentinel"), "skill").expect("write skill");

        let result = cleanup_at(&layout, CleanupMode::All).expect("cleanup should succeed");
        assert!(result.central_removed);
        assert!(!layout.root.exists());
    }

    #[test]
    fn keeps_skills_but_removes_management_metadata() {
        let layout = test_layout("keep");
        layout.ensure_roots().expect("create layout");
        fs::write(layout.local_root().join("sentinel"), "skill").expect("write skill");
        fs::write(layout.settings_path(), "{}").expect("write settings");
        lockfile::save(&layout, &lockfile::SkillLockFile::default()).expect("write lock");

        let result = cleanup_at(&layout, CleanupMode::KeepSkills).expect("cleanup should succeed");
        assert!(!result.central_removed);
        assert!(layout.local_root().join("sentinel").is_file());
        assert!(!layout.lock_root().exists());
        assert!(!layout.settings_path().exists());
        fs::remove_dir_all(layout.root).expect("remove test root");
    }

    #[test]
    fn rejects_a_symlinked_repository_root() {
        let layout = test_layout("symlink");
        #[cfg(unix)]
        {
            let outside = layout.root.with_file_name("skillsage-cleanup-outside");
            let _ = fs::remove_dir_all(&outside);
            fs::create_dir_all(&outside).expect("create outside");
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
