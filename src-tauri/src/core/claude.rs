use std::path::Path;

use crate::core::repo::{layout::RepoLayout, lockfile, lockfile::SkillLockRecord};
use crate::error::SkillsageError;

pub fn set_at(
    layout: &RepoLayout,
    skill_id: &str,
    distributed: bool,
) -> Result<SkillLockRecord, SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let current = lock
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;
    let source = layout.skill(&current.name)?;
    let target = layout.claude_skill(&current.name)?;

    let changed = if distributed {
        ensure_real_skill_directory(&source)?;
        layout.ensure_claude_root()?;
        create_link_if_needed(&source, &target)?
    } else {
        remove_link_at(layout, &current)?
    };

    let mut next = current.clone();
    next.claude_distributed = distributed;
    lock.skills.insert(skill_id.to_string(), next.clone());
    if let Err(error) = lockfile::save(layout, &lock) {
        let recovery = if changed {
            if distributed {
                remove_owned_link(&source, &target).map(|_| ())
            } else {
                create_link(&source, &target).map(|_| ())
            }
        } else {
            Ok(())
        };
        return match recovery {
            Ok(()) => Err(error),
            Err(recovery) => Err(SkillsageError::Io(format!(
                "保存 Claude 分发状态失败: {error}; 恢复失败: {recovery}"
            ))),
        };
    }
    Ok(next)
}

pub fn is_distributed_at(
    layout: &RepoLayout,
    record: &SkillLockRecord,
) -> Result<bool, SkillsageError> {
    let source = layout.skill(&record.name)?;
    let target = layout.claude_skill(&record.name)?;
    match std::fs::symlink_metadata(&target) {
        Ok(metadata) if is_link_metadata(&metadata) => link_points_to(&source, &target),
        Ok(_) => Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub fn remove_link_at(
    layout: &RepoLayout,
    record: &SkillLockRecord,
) -> Result<bool, SkillsageError> {
    let source = layout.skill(&record.name)?;
    let target = layout.claude_skill(&record.name)?;
    remove_owned_link(&source, &target)
}

fn ensure_real_skill_directory(path: &Path) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(()),
        Ok(_) => Err(SkillsageError::Io(format!(
            "公共技能目录不是受 SkillSage 管理的真实目录: {}",
            path.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err(SkillsageError::PathNotFound(path.to_path_buf()))
        }
        Err(error) => Err(error.into()),
    }
}

fn create_link_if_needed(source: &Path, target: &Path) -> Result<bool, SkillsageError> {
    match std::fs::symlink_metadata(target) {
        Ok(metadata) if is_link_metadata(&metadata) => {
            if link_points_to(source, target)? {
                Ok(false)
            } else {
                Err(SkillsageError::InstallConflict(format!(
                    "Claude 技能路径已被其他链接占用: {}",
                    target.display()
                )))
            }
        }
        Ok(_) => Err(SkillsageError::InstallConflict(format!(
            "Claude 技能路径已被占用: {}",
            target.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            create_link(source, target)?;
            Ok(true)
        }
        Err(error) => Err(error.into()),
    }
}

fn create_link(source: &Path, target: &Path) -> Result<(), SkillsageError> {
    #[cfg(unix)]
    std::os::unix::fs::symlink(source, target)?;
    #[cfg(windows)]
    {
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(target)
            .arg(source)
            .output()?;
        if !output.status.success() {
            let reason = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let reason = if reason.is_empty() {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            } else {
                reason
            };
            return Err(SkillsageError::Io(format!(
                "无法创建 Claude 技能链接: {}{}",
                target.display(),
                if reason.is_empty() {
                    String::new()
                } else {
                    format!(" ({reason})")
                }
            )));
        }
    }
    Ok(())
}

fn remove_owned_link(source: &Path, target: &Path) -> Result<bool, SkillsageError> {
    match std::fs::symlink_metadata(target) {
        Ok(metadata) if is_link_metadata(&metadata) => {
            if !link_points_to(source, target)? {
                return Err(SkillsageError::InstallConflict(format!(
                    "Claude 技能链接不是当前技能创建的: {}",
                    target.display()
                )));
            }
            remove_symlink(target)?;
            Ok(true)
        }
        Ok(_) => Err(SkillsageError::InstallConflict(format!(
            "Claude 技能路径不是可安全删除的链接: {}",
            target.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn remove_symlink(path: &Path) -> Result<(), SkillsageError> {
    #[cfg(unix)]
    std::fs::remove_file(path)?;
    #[cfg(windows)]
    std::fs::remove_dir(path)?;
    Ok(())
}

fn link_points_to(source: &Path, target: &Path) -> Result<bool, SkillsageError> {
    let linked_target = std::fs::read_link(target)?;
    if linked_target == source {
        return Ok(true);
    }
    let linked_target = if linked_target.is_absolute() {
        linked_target
    } else {
        target
            .parent()
            .map(|parent| parent.join(&linked_target))
            .unwrap_or(linked_target)
    };
    match (
        std::fs::canonicalize(linked_target),
        std::fs::canonicalize(source),
    ) {
        (Ok(linked_target), Ok(source)) => Ok(linked_target == source),
        _ => Ok(false),
    }
}

fn is_link_metadata(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        let file_type = metadata.file_type();
        file_type.is_symlink() || file_type.is_symlink_dir() || file_type.is_symlink_file()
    }
    #[cfg(unix)]
    {
        metadata.file_type().is_symlink()
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::set_at;
    use crate::core::lifecycle::install::{install_test_skill_at, TEST_SKILL_ID};
    use crate::core::repo::{layout::RepoLayout, lockfile};

    #[test]
    fn refuses_to_replace_a_foreign_claude_directory() {
        let root =
            std::env::temp_dir().join(format!("skillsage-claude-conflict-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");
        layout
            .ensure_claude_root()
            .expect("Claude root should exist");
        let target = layout
            .claude_skill("skillsage-phase2-test")
            .expect("Claude path should resolve");
        fs::create_dir(&target).expect("create foreign Claude directory");

        let error = set_at(&layout, TEST_SKILL_ID, true).expect_err("foreign path must block");
        assert!(error.to_string().contains("Claude 技能路径已被占用"));
        assert!(target.is_dir());
        assert!(
            !lockfile::load(&layout)
                .expect("lock should load")
                .skills
                .get(TEST_SKILL_ID)
                .expect("skill should remain installed")
                .claude_distributed
        );

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn creates_and_removes_the_owned_claude_link() {
        let root =
            std::env::temp_dir().join(format!("skillsage-claude-link-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");

        let linked = set_at(&layout, TEST_SKILL_ID, true).expect("link should be created");
        assert!(linked.claude_distributed);
        let target = layout
            .claude_skill("skillsage-phase2-test")
            .expect("Claude path should resolve");
        assert!(super::is_link_metadata(
            &fs::symlink_metadata(&target).expect("link should exist")
        ));
        assert!(super::is_distributed_at(&layout, &linked).expect("link state should be detected"));

        let unlinked = set_at(&layout, TEST_SKILL_ID, false).expect("link should be removed");
        assert!(!unlinked.claude_distributed);
        assert!(fs::symlink_metadata(&target).is_err());

        set_at(&layout, TEST_SKILL_ID, true).expect("link should be recreated");
        crate::core::lifecycle::install::uninstall_skill_at(&layout, TEST_SKILL_ID)
            .expect("fixture should uninstall");
        assert!(fs::symlink_metadata(&target).is_err());
        fs::remove_dir_all(root).expect("remove test root");
    }
}
