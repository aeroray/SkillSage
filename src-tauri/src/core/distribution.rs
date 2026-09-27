//! Per-tool distribution: linking a skill's real directory into a tool's own
//! skills directory, for tools that do not read the shared directory.
//!
//! The set of tools and their directories live in [`crate::core::tools`]. This
//! module only performs the link, and it refuses to act for a tool that reads
//! the shared directory — a link would be redundant, and the user turning that
//! flag on is exactly the signal to stop linking.

use std::path::Path;

use crate::core::repo::{layout::RepoLayout, lockfile, lockfile::SkillLockRecord};
use crate::core::tools::{self, ToolResolver, ToolSpec};
use crate::error::SkillsageError;

/// Links a skill into one tool's directory, or removes that link.
pub fn set_at(
    layout: &RepoLayout,
    resolver: &ToolResolver,
    skill_id: &str,
    distributed: bool,
    tool: &ToolSpec,
) -> Result<SkillLockRecord, SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let current = lock
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;
    let source = layout.skill(&current.name)?;
    let target_path = resolver
        .skill_path(tool, &current.name)?
        .ok_or_else(|| {
            SkillsageError::Io(format!("{} 没有可用的技能目录", tool.label))
        })?;

    if distributed && resolver.reads_shared(tool) {
        // The tool already sees the shared directory; creating a link would
        // duplicate it and contradict the setting.
        return Err(SkillsageError::Io(format!(
            "{} 已设置为读取公共技能目录，无需分发",
            tool.label
        )));
    }

    let changed = if distributed {
        ensure_real_skill_directory(&source)?;
        ensure_directory_chain(
            target_path
                .parent()
                .ok_or_else(|| SkillsageError::Io("工具技能目录无效".into()))?,
            tool.label,
        )?;
        create_link_if_needed(&source, &target_path, tool)?
    } else {
        remove_owned_link(&source, &target_path, tool)?
    };

    let mut next = current.clone();
    next.distributed_to = current_distributed_targets(layout, resolver, &next)?;
    lock.skills.insert(skill_id.to_string(), next.clone());
    if let Err(error) = lockfile::save(layout, &lock) {
        let recovery = if changed {
            if distributed {
                remove_owned_link(&source, &target_path, tool).map(|_| ())
            } else {
                create_link(&source, &target_path, tool).map(|_| ())
            }
        } else {
            Ok(())
        };
        return match recovery {
            Ok(()) => Err(error),
            Err(recovery) => Err(SkillsageError::Io(format!(
                "保存{}分发状态失败: {error}; 恢复失败: {recovery}",
                tool.label
            ))),
        };
    }
    Ok(next)
}

/// Removes every link a skill has, for tools it no longer needs. Used when a
/// tool is switched to reading the shared directory, and on uninstall.
pub fn remove_all_links(
    layout: &RepoLayout,
    resolver: &ToolResolver,
    record: &SkillLockRecord,
) -> Result<usize, SkillsageError> {
    let mut removed = 0;
    for tool in tools::TOOLS {
        if !tool.distributable() {
            continue;
        }
        if remove_owned_link_if_ours(layout, resolver, record, tool)? {
            removed += 1;
        }
    }
    Ok(removed)
}

/// Removes this skill's link for one tool, ignoring a missing link but still
/// refusing to delete a directory we did not create.
pub fn remove_owned_link_for(
    layout: &RepoLayout,
    resolver: &ToolResolver,
    record: &SkillLockRecord,
    tool: &ToolSpec,
) -> Result<bool, SkillsageError> {
    remove_owned_link_if_ours(layout, resolver, record, tool)
}

/// Removes this skill's link for one tool, ignoring a missing link but still
/// refusing to delete a directory we did not create.
fn remove_owned_link_if_ours(
    layout: &RepoLayout,
    resolver: &ToolResolver,
    record: &SkillLockRecord,
    tool: &ToolSpec,
) -> Result<bool, SkillsageError> {
    let source = layout.skill(&record.name)?;
    let Some(target_path) = resolver.skill_path(tool, &record.name)? else {
        return Ok(false);
    };
    match std::fs::symlink_metadata(&target_path) {
        Ok(metadata) if is_link_metadata(&metadata) => {
            if !link_points_to(&source, &target_path)? {
                // Someone else's link; leave it alone.
                return Ok(false);
            }
            remove_symlink(&target_path)?;
            Ok(true)
        }
        Ok(_) => Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub fn is_distributed_at(
    layout: &RepoLayout,
    resolver: &ToolResolver,
    record: &SkillLockRecord,
    tool: &ToolSpec,
) -> Result<bool, SkillsageError> {
    let source = layout.skill(&record.name)?;
    let Some(target_path) = resolver.skill_path(tool, &record.name)? else {
        return Ok(false);
    };
    match std::fs::symlink_metadata(&target_path) {
        Ok(metadata) if is_link_metadata(&metadata) => link_points_to(&source, &target_path),
        Ok(_) => Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

/// Every tool that currently has a link for this skill, read from disk rather
/// than trusted from the lock record — the directory is the source of truth,
/// and a link removed outside the app must stop being reported.
pub fn current_distributed_targets(
    layout: &RepoLayout,
    resolver: &ToolResolver,
    record: &SkillLockRecord,
) -> Result<Vec<String>, SkillsageError> {
    let mut distributed = Vec::new();
    for tool in tools::TOOLS {
        if !tool.distributable() {
            continue;
        }
        if is_distributed_at(layout, resolver, record, tool)? {
            distributed.push(tool.id.to_string());
        }
    }
    Ok(distributed)
}

/// Recomputes `distributed_to` for every record. Runs after a settings change
/// so the stored state matches the new rules immediately, and after upgrading
/// from the old two-boolean format.
pub fn refresh_all(
    layout: &RepoLayout,
    resolver: &ToolResolver,
) -> Result<usize, SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let mut changed = 0;
    for record in lock.skills.values_mut() {
        let targets = current_distributed_targets(layout, resolver, record)?;
        if targets != record.distributed_to {
            record.distributed_to = targets;
            changed += 1;
        }
    }
    if changed > 0 {
        lockfile::save(layout, &lock)?;
    }
    Ok(changed)
}

/// Removes links left in directories that were never real (see
/// [`tools::LEGACY_SKILLS_DIRS`]). Those links point somewhere no tool reads,
/// which is why a tool could still look "distributed" after being uninstalled.
pub fn clean_legacy_links(layout: &RepoLayout, home: &Path) -> Result<usize, SkillsageError> {
    let mut removed = 0;
    // Canonicalize the comparison base too. `fs::canonicalize` returns a
    // `\\?\`-prefixed verbatim path on Windows, and that prefix is a path
    // component, so `resolved.starts_with(public_root)` is false when only one
    // side is canonicalized — the cleanup would silently do nothing there.
    let public_root = std::fs::canonicalize(&layout.public_root).ok();
    for relative in tools::LEGACY_SKILLS_DIRS {
        let root = home.join(relative);
        if !root.is_dir() {
            continue;
        }
        for entry in std::fs::read_dir(&root)? {
            let path = entry?.path();
            let metadata = std::fs::symlink_metadata(&path)?;
            if !is_link_metadata(&metadata) {
                continue;
            }
            // Only remove links that point back into the shared directory, so
            // an unrelated entry in a leftover folder is never deleted.
            let Ok(target) = std::fs::read_link(&path) else {
                continue;
            };
            let target = if target.is_absolute() {
                target
            } else {
                path.parent()
                    .map(|parent| parent.join(&target))
                    .unwrap_or(target)
            };
            let Ok(resolved) = std::fs::canonicalize(&target) else {
                continue;
            };
            let ours = match &public_root {
                Some(base) => resolved.starts_with(base),
                // Without a canonical base, fall back to the raw path so a
                // missing shared directory cannot turn into "delete nothing".
                None => resolved.starts_with(&layout.public_root),
            };
            if ours {
                remove_symlink(&path)?;
                removed += 1;
            }
        }
        // Drop the now-empty leftover folder so it stops looking installed.
        if std::fs::read_dir(&root)?.next().is_none() {
            let _ = std::fs::remove_dir(&root);
            if let Some(parent) = root.parent() {
                let _ = std::fs::remove_dir(parent);
            }
        }
    }
    Ok(removed)
}

/// Groups the tools that need a link, for the frontend's distribution UI.
pub fn distributable_tools(resolver: &ToolResolver) -> Vec<&'static ToolSpec> {
    tools::TOOLS
        .iter()
        .filter(|tool| resolver.needs_distribution(tool))
        .collect()
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

/// Creates every missing ancestor one component at a time, so a user-controlled
/// symlink in the middle of a tool path cannot redirect the write elsewhere.
fn ensure_directory_chain(path: &Path, label: &str) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(SkillsageError::Io(format!(
            "{label}技能目录不能是符号链接: {}",
            path.display()
        ))),
        Ok(metadata) if !metadata.is_dir() => Err(SkillsageError::Io(format!(
            "{label}技能目录不是目录: {}",
            path.display()
        ))),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let parent = path
                .parent()
                .ok_or_else(|| SkillsageError::Io(format!("无法创建{label}技能目录")))?;
            if parent != path {
                ensure_directory_chain(parent, label)?;
            }
            std::fs::create_dir(path)?;
            Ok(())
        }
        Err(error) => Err(error.into()),
    }
}

fn create_link_if_needed(
    source: &Path,
    target_path: &Path,
    tool: &ToolSpec,
) -> Result<bool, SkillsageError> {
    match std::fs::symlink_metadata(target_path) {
        Ok(metadata) if is_link_metadata(&metadata) => {
            if link_points_to(source, target_path)? {
                Ok(false)
            } else {
                Err(SkillsageError::InstallConflict(format!(
                    "{} 技能路径已被其他链接占用: {}",
                    tool.label,
                    target_path.display()
                )))
            }
        }
        Ok(_) => Err(SkillsageError::InstallConflict(format!(
            "{} 技能路径已被占用: {}",
            tool.label,
            target_path.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            create_link(source, target_path, tool)?;
            Ok(true)
        }
        Err(error) => Err(error.into()),
    }
}

fn create_link(source: &Path, target_path: &Path, tool: &ToolSpec) -> Result<(), SkillsageError> {
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
                tool.label,
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
    tool: &ToolSpec,
) -> Result<bool, SkillsageError> {
    match std::fs::symlink_metadata(target_path) {
        Ok(metadata) if is_link_metadata(&metadata) => {
            if !link_points_to(source, target_path)? {
                return Err(SkillsageError::InstallConflict(format!(
                    "{} 技能链接不是当前技能创建的: {}",
                    tool.label,
                    target_path.display()
                )));
            }
            remove_symlink(target_path)?;
            Ok(true)
        }
        Ok(_) => Err(SkillsageError::InstallConflict(format!(
            "{} 技能路径不是可安全删除的链接: {}",
            tool.label,
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

    use super::{clean_legacy_links, refresh_all, remove_all_links, set_at};
    use crate::core::lifecycle::install::{install_test_skill_at, TEST_SKILL_ID};
    use crate::core::repo::{layout::RepoLayout, lockfile};
    use crate::core::tools::{self, ToolOverride, ToolResolver};
    use std::collections::BTreeMap;

    fn setup(name: &str) -> (std::path::PathBuf, RepoLayout, ToolResolver) {
        let root =
            std::env::temp_dir().join(format!("skillsage-dist-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");
        let resolver = ToolResolver::new(root.clone(), BTreeMap::new());
        (root, layout, resolver)
    }

    #[test]
    fn legacy_cleanup_removes_the_leftover_folder() {
        let (root, layout, _) = setup("legacy-folder");
        let legacy_root = root.join(".workbuddy-ai").join("skills");
        fs::create_dir_all(&legacy_root).expect("create legacy root");
        clean_legacy_links(&layout, &root).expect("clean");
        assert!(
            !root.join(".workbuddy-ai").exists(),
            "the empty legacy tree should be removed so it stops looking installed"
        );
        fs::remove_dir_all(root).expect("remove test root");
    }

    fn tool(id: &str) -> &'static tools::ToolSpec {
        tools::find(id).expect("registered tool")
    }

    #[test]
    fn creates_and_removes_links_for_a_registered_tool() {
        let (root, layout, resolver) = setup("links");
        let claude = tool("claude-code");

        let linked =
            set_at(&layout, &resolver, TEST_SKILL_ID, true, claude).expect("link should be created");
        assert_eq!(linked.distributed_to, vec!["claude-code".to_string()]);
        let link_path = resolver
            .skill_path(claude, &linked.name)
            .unwrap()
            .expect("path");
        assert!(link_path.exists());
        assert!(link_path.join("SKILL.md").is_file());

        let unlinked =
            set_at(&layout, &resolver, TEST_SKILL_ID, false, claude).expect("link should be removed");
        assert!(unlinked.distributed_to.is_empty());
        assert!(!link_path.exists());

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn two_tools_are_tracked_independently() {
        let (root, layout, resolver) = setup("two-tools");
        let claude = tool("claude-code");
        let codebuddy = tool("codebuddy");

        set_at(&layout, &resolver, TEST_SKILL_ID, true, claude).expect("claude link");
        let both = set_at(&layout, &resolver, TEST_SKILL_ID, true, codebuddy).expect("codebuddy link");
        let mut targets = both.distributed_to.clone();
        targets.sort();
        assert_eq!(targets, vec!["claude-code".to_string(), "codebuddy".to_string()]);

        let lock = lockfile::load(&layout).expect("load");
        assert_eq!(lock.skills[TEST_SKILL_ID].distributed_to.len(), 2);

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn refuses_to_link_a_tool_that_reads_the_shared_directory() {
        let (root, layout, resolver) = setup("reads-shared");
        // Cursor reads the shared directory by default, so it needs no link.
        let cursor = tool("cursor");
        let result = set_at(&layout, &resolver, TEST_SKILL_ID, true, cursor);
        assert!(result.is_err(), "linking a shared-reading tool must fail");
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn turning_on_reads_shared_stops_requiring_a_link() {
        let (root, _layout, _) = setup("toggle");
        let claude = tool("claude-code");

        let mut overrides = BTreeMap::new();
        overrides.insert(
            "claude-code".to_string(),
            ToolOverride {
                reads_shared: Some(true),
                skills_dir: None,
            },
        );
        let resolver = ToolResolver::new(root.clone(), overrides);

        // The tool is no longer distributable, so it drops out of the list.
        assert!(!resolver.needs_distribution(claude));
        assert!(!tools::TOOLS.is_empty());
        let needed: Vec<&str> = super::distributable_tools(&resolver)
            .iter()
            .map(|t| t.id)
            .collect();
        assert!(!needed.contains(&"claude-code"));

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn remove_all_links_clears_every_tool() {
        let (root, layout, resolver) = setup("remove-all");
        set_at(&layout, &resolver, TEST_SKILL_ID, true, tool("claude-code")).expect("claude");
        set_at(&layout, &resolver, TEST_SKILL_ID, true, tool("codebuddy")).expect("codebuddy");

        let lock = lockfile::load(&layout).expect("load");
        let record = lock.skills[TEST_SKILL_ID].clone();
        let removed = remove_all_links(&layout, &resolver, &record).expect("remove all");
        assert_eq!(removed, 2);

        let claude_path = resolver
            .skill_path(tool("claude-code"), &record.name)
            .unwrap()
            .unwrap();
        assert!(!claude_path.exists());

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn refresh_recomputes_targets_from_disk() {
        let (root, layout, resolver) = setup("refresh");
        set_at(&layout, &resolver, TEST_SKILL_ID, true, tool("claude-code")).expect("link");

        // A link removed outside the app must stop being reported.
        let mut lock = lockfile::load(&layout).expect("load");
        lock.skills
            .get_mut(TEST_SKILL_ID)
            .expect("tracked")
            .distributed_to = vec!["claude-code".into(), "codebuddy".into()];
        lockfile::save(&layout, &lock).expect("save stale");

        let changed = refresh_all(&layout, &resolver).expect("refresh");
        assert_eq!(changed, 1);
        let lock = lockfile::load(&layout).expect("load");
        assert_eq!(
            lock.skills[TEST_SKILL_ID].distributed_to,
            vec!["claude-code".to_string()]
        );

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn cleans_links_left_in_the_legacy_workbuddy_directory() {
        let (root, layout, _) = setup("legacy-clean");
        // Reproduce the old bug: a link in a directory no tool reads.
        let legacy_root = root.join(".workbuddy-ai").join("skills");
        fs::create_dir_all(&legacy_root).expect("create legacy root");
        let name = lockfile::load(&layout).expect("load").skills[TEST_SKILL_ID]
            .name
            .clone();
        let source = layout.skill(&name).expect("source");
        let link = legacy_root.join(&name);
        #[cfg(unix)]
        std::os::unix::fs::symlink(&source, &link).expect("legacy symlink");
        #[cfg(windows)]
        {
            let status = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(&link)
                .arg(&source)
                .status()
                .expect("mklink");
            assert!(status.success(), "legacy junction should be created");
        }
        assert!(link.exists());

        let removed = clean_legacy_links(&layout, &root).expect("clean");
        assert_eq!(removed, 1);
        assert!(!link.exists());

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn legacy_cleanup_leaves_foreign_links_alone() {
        let (root, layout, _) = setup("legacy-foreign");
        let legacy_root = root.join(".workbuddy-ai").join("skills");
        fs::create_dir_all(&legacy_root).expect("create legacy root");
        // A link pointing somewhere outside the shared directory is not ours.
        let outside = root.join("elsewhere");
        fs::create_dir_all(&outside).expect("create outside");
        let link = legacy_root.join("someone-elses");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &link).expect("foreign symlink");
        #[cfg(windows)]
        {
            let status = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(&link)
                .arg(&outside)
                .status()
                .expect("mklink");
            assert!(status.success(), "foreign junction should be created");
        }

        let removed = clean_legacy_links(&layout, &root).expect("clean");
        assert_eq!(removed, 0, "a foreign link must not be removed");
        assert!(link.exists());

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[cfg(windows)]
    #[test]
    fn creates_a_link_when_the_home_path_contains_cmd_metacharacters() {
        // `cmd /C` re-parses its command line, so an unquoted `&` in the home
        // path used to truncate the source path and run the remainder as a
        // second command, producing a junction to the wrong directory.
        let root = std::env::temp_dir().join(format!(
            "skillsage-dist-metachar-{}&x",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");
        let resolver = ToolResolver::new(root.clone(), BTreeMap::new());

        let linked = set_at(&layout, &resolver, TEST_SKILL_ID, true, tool("claude-code"))
            .expect("link should be created despite the metacharacter");
        let link_path = resolver
            .skill_path(tool("claude-code"), &linked.name)
            .unwrap()
            .unwrap();
        assert!(link_path.join("SKILL.md").is_file());

        set_at(&layout, &resolver, TEST_SKILL_ID, false, tool("claude-code"))
            .expect("link should be removed");
        let _ = fs::remove_dir_all(&root);
    }
}
