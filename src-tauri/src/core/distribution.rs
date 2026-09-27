use std::path::Path;

use crate::core::repo::{layout::RepoLayout, lockfile, lockfile::SkillLockRecord};
use crate::error::SkillsageError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DistributionTarget {
    ClaudeCode,
    WorkBuddy,
}

impl DistributionTarget {
    pub fn label(self) -> &'static str {
        match self {
            Self::ClaudeCode => "Claude Code",
            Self::WorkBuddy => "Work Buddy",
        }
    }

    fn skill_path(
        self,
        layout: &RepoLayout,
        name: &str,
    ) -> Result<std::path::PathBuf, SkillsageError> {
        match self {
            Self::ClaudeCode => layout.claude_skill(name),
            Self::WorkBuddy => layout.workbuddy_skill(name),
        }
    }

    fn ensure_root(self, layout: &RepoLayout) -> Result<(), SkillsageError> {
        match self {
            Self::ClaudeCode => layout.ensure_claude_root(),
            Self::WorkBuddy => layout.ensure_workbuddy_root(),
        }
    }
}

pub fn set_at(
    layout: &RepoLayout,
    skill_id: &str,
    distributed: bool,
    target: DistributionTarget,
) -> Result<SkillLockRecord, SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let current = lock
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;
    let source = layout.skill(&current.name)?;
    let target_path = target.skill_path(layout, &current.name)?;

    let changed = if distributed {
        ensure_real_skill_directory(&source)?;
        target.ensure_root(layout)?;
        create_link_if_needed(&source, &target_path, target)?
    } else {
        remove_link_at(layout, &current, target)?
    };

    let mut next = current.clone();
    next.claude_distributed = is_distributed_at(layout, &next, DistributionTarget::ClaudeCode)?;
    next.workbuddy_distributed = is_distributed_at(layout, &next, DistributionTarget::WorkBuddy)?;
    lock.skills.insert(skill_id.to_string(), next.clone());
    if let Err(error) = lockfile::save(layout, &lock) {
        let recovery = if changed {
            if distributed {
                remove_owned_link(&source, &target_path, target).map(|_| ())
            } else {
                create_link(&source, &target_path, target).map(|_| ())
            }
        } else {
            Ok(())
        };
        return match recovery {
            Ok(()) => Err(error),
            Err(recovery) => Err(SkillsageError::Io(format!(
                "保存{}分发状态失败: {error}; 恢复失败: {recovery}",
                target.label()
            ))),
        };
    }
    Ok(next)
}

pub fn is_distributed_at(
    layout: &RepoLayout,
    record: &SkillLockRecord,
    target: DistributionTarget,
) -> Result<bool, SkillsageError> {
    let source = layout.skill(&record.name)?;
    let target_path = target.skill_path(layout, &record.name)?;
    match std::fs::symlink_metadata(&target_path) {
        Ok(metadata) if is_link_metadata(&metadata) => link_points_to(&source, &target_path),
        Ok(_) => Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub fn remove_link_at(
    layout: &RepoLayout,
    record: &SkillLockRecord,
    target: DistributionTarget,
) -> Result<bool, SkillsageError> {
    let source = layout.skill(&record.name)?;
    let target_path = target.skill_path(layout, &record.name)?;
    remove_owned_link(&source, &target_path, target)
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

fn create_link_if_needed(
    source: &Path,
    target_path: &Path,
    target: DistributionTarget,
) -> Result<bool, SkillsageError> {
    match std::fs::symlink_metadata(target_path) {
        Ok(metadata) if is_link_metadata(&metadata) => {
            if link_points_to(source, target_path)? {
                Ok(false)
            } else {
                Err(SkillsageError::InstallConflict(format!(
                    "{} 技能路径已被其他链接占用: {}",
                    target.label(),
                    target_path.display()
                )))
            }
        }
        Ok(_) => Err(SkillsageError::InstallConflict(format!(
            "{} 技能路径已被占用: {}",
            target.label(),
            target_path.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            create_link(source, target_path, target)?;
            Ok(true)
        }
        Err(error) => Err(error.into()),
    }
}

fn create_link(
    source: &Path,
    target_path: &Path,
    target: DistributionTarget,
) -> Result<(), SkillsageError> {
    #[cfg(unix)]
    std::os::unix::fs::symlink(source, target_path)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        // `cmd /C` re-parses its command line, so the paths must be passed as
        // pre-quoted raw arguments. `Command::arg` only quotes on whitespace
        // and does not escape cmd.exe metacharacters: a home directory such as
        // `C:\Users\a&b` would be split at `&`, creating the junction against a
        // truncated path and running the remainder as a second command.
        let mut command = std::process::Command::new("cmd");
        command.arg("/C").arg("mklink").arg("/J");
        command.raw_arg(quote_for_cmd(target_path));
        command.raw_arg(quote_for_cmd(source));
        let output = command.output()?;
        if !output.status.success() {
            let reason = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let reason = if reason.is_empty() {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            } else {
                reason
            };
            return Err(SkillsageError::Io(format!(
                "无法创建 {} 技能链接: {}{}",
                target.label(),
                target_path.display(),
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

/// Wraps a path in double quotes for `cmd.exe`, escaping embedded quotes and
/// neutralizing `%` (which cmd would otherwise expand as a variable) with
/// `^`. A `"` inside a path is not representable for cmd, so it is escaped as
/// best as possible rather than silently truncating the argument.
#[cfg(windows)]
fn quote_for_cmd(path: &Path) -> String {
    let value = path.to_string_lossy();
    let mut escaped = String::with_capacity(value.len() + 2);
    escaped.push('"');
    for character in value.chars() {
        match character {
            '%' => escaped.push_str("^%"),
            '"' => escaped.push_str("\\\""),
            other => escaped.push(other),
        }
    }
    escaped.push('"');
    escaped
}

fn remove_owned_link(
    source: &Path,
    target_path: &Path,
    target: DistributionTarget,
) -> Result<bool, SkillsageError> {
    match std::fs::symlink_metadata(target_path) {
        Ok(metadata) if is_link_metadata(&metadata) => {
            if !link_points_to(source, target_path)? {
                return Err(SkillsageError::InstallConflict(format!(
                    "{} 技能链接不是当前技能创建的: {}",
                    target.label(),
                    target_path.display()
                )));
            }
            remove_symlink(target_path)?;
            Ok(true)
        }
        Ok(_) => Err(SkillsageError::InstallConflict(format!(
            "{} 技能路径不是可安全删除的链接: {}",
            target.label(),
            target_path.display()
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

fn link_points_to(source: &Path, target_path: &Path) -> Result<bool, SkillsageError> {
    let linked_target = std::fs::read_link(target_path)?;
    if linked_target == source {
        return Ok(true);
    }
    let linked_target = if linked_target.is_absolute() {
        linked_target
    } else {
        target_path
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

    use super::{set_at, DistributionTarget};
    use crate::core::lifecycle::install::{install_test_skill_at, TEST_SKILL_ID};
    use crate::core::repo::{layout::RepoLayout, lockfile};

    #[test]
    fn creates_and_removes_links_for_both_supported_tools() {
        let root = std::env::temp_dir().join(format!(
            "skillsage-distribution-links-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");

        for target in [
            DistributionTarget::ClaudeCode,
            DistributionTarget::WorkBuddy,
        ] {
            let linked =
                set_at(&layout, TEST_SKILL_ID, true, target).expect("link should be created");
            let link_path = match target {
                DistributionTarget::ClaudeCode => layout.claude_skill(&linked.name).unwrap(),
                DistributionTarget::WorkBuddy => layout.workbuddy_skill(&linked.name).unwrap(),
            };
            assert!(link_path.exists());

            let unlinked =
                set_at(&layout, TEST_SKILL_ID, false, target).expect("link should be removed");
            assert!(!link_path.exists());
            match target {
                DistributionTarget::ClaudeCode => assert!(!unlinked.claude_distributed),
                DistributionTarget::WorkBuddy => assert!(!unlinked.workbuddy_distributed),
            }
        }

        let lock = lockfile::load(&layout).expect("lock should load");
        assert!(!lock.skills[TEST_SKILL_ID].claude_distributed);
        assert!(!lock.skills[TEST_SKILL_ID].workbuddy_distributed);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[cfg(windows)]
    #[test]
    fn creates_a_link_when_the_home_path_contains_cmd_metacharacters() {
        // `cmd /C` re-parses its command line, so an unquoted `&` in the home
        // path used to truncate the source path and run the remainder as a
        // second command, producing a junction to the wrong directory.
        let root = std::env::temp_dir().join(format!(
            "skillsage-distribution-metachar-{}&x",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");

        let linked = set_at(&layout, TEST_SKILL_ID, true, DistributionTarget::ClaudeCode)
            .expect("link should be created despite the metacharacter");
        let link_path = layout.claude_skill(&linked.name).expect("link path");
        assert!(link_path.exists(), "link should resolve to the real skill");
        // The junction must point at the real skill directory, not a truncated
        // prefix of it.
        assert!(link_path.join("SKILL.md").is_file());

        set_at(&layout, TEST_SKILL_ID, false, DistributionTarget::ClaudeCode)
            .expect("link should be removed");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn preserves_an_existing_tool_link_when_another_tool_is_enabled() {
        let root = std::env::temp_dir().join(format!(
            "skillsage-distribution-stale-state-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");

        set_at(&layout, TEST_SKILL_ID, true, DistributionTarget::ClaudeCode)
            .expect("Claude link should be created");
        let mut lock = lockfile::load(&layout).expect("lock should load");
        lock.skills
            .get_mut(TEST_SKILL_ID)
            .expect("fixture should be tracked")
            .claude_distributed = false;
        lockfile::save(&layout, &lock).expect("stale lock should save");

        let updated = set_at(&layout, TEST_SKILL_ID, true, DistributionTarget::WorkBuddy)
            .expect("Work Buddy link should be created");
        assert!(updated.claude_distributed);
        assert!(updated.workbuddy_distributed);

        let lock = lockfile::load(&layout).expect("lock should load");
        assert!(lock.skills[TEST_SKILL_ID].claude_distributed);
        assert!(lock.skills[TEST_SKILL_ID].workbuddy_distributed);

        set_at(
            &layout,
            TEST_SKILL_ID,
            false,
            DistributionTarget::ClaudeCode,
        )
        .expect("Claude link should be removed");
        set_at(&layout, TEST_SKILL_ID, false, DistributionTarget::WorkBuddy)
            .expect("Work Buddy link should be removed");
        fs::remove_dir_all(root).expect("remove test root");
    }
}
