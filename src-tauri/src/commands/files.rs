use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::core::lifecycle::install::destination_for_record;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::error::SkillsageError;

/// What `open_path` actually opened.
///
/// The requested directory may legitimately not exist yet — a tool that has
/// never been used has no `skills/` folder of its own — so the file manager is
/// pointed at the nearest existing ancestor instead. Reporting which path that
/// was lets the UI name it, because silently opening a different folder is
/// exactly as confusing as opening nothing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPathResult {
    /// The directory actually opened. Equal to the requested path when it
    /// exists.
    pub opened: String,
    /// False when the requested directory was missing and an ancestor was
    /// opened instead.
    pub exact: bool,
}

#[tauri::command]
pub async fn open_path(path: String) -> Result<OpenPathResult, SkillsageError> {
    tokio::task::spawn_blocking(move || {
        let (target, exact) = resolve_open_target(Path::new(&path))?;
        open_in_file_manager(&target)?;
        Ok(OpenPathResult {
            opened: target.to_string_lossy().into_owned(),
            exact,
        })
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn open_skill_directory(skill_id: String) -> Result<(), SkillsageError> {
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        let record = lockfile::load(&layout)?
            .skills
            .get(&skill_id)
            .cloned()
            .ok_or_else(|| SkillsageError::NotInstalled(skill_id.clone()))?;
        let path = destination_for_record(&layout, &record)?;
        // Strict here: an installed skill's directory is expected to exist, so
        // falling back to its parent would hide a broken install behind a
        // folder that looks plausible.
        if !path.is_dir() {
            return Err(SkillsageError::PathNotFound(path));
        }
        open_in_file_manager(&path)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

/// Resolves what to hand the file manager, walking up to the nearest ancestor
/// that exists.
///
/// Deliberately does **not** create the missing directory. `ToolResolver::detected`
/// treats the skills directory — or its parent — existing as the signal that a
/// tool is installed, so creating one would make an uninstalled tool report
/// itself as installed and start appearing in every skill row.
fn resolve_open_target(path: &Path) -> Result<(PathBuf, bool), SkillsageError> {
    if path.is_dir() {
        return Ok((path.to_path_buf(), true));
    }

    let mut current = path.parent();
    while let Some(candidate) = current {
        // A relative path's first parent is the empty path, which would open
        // the process's working directory — never what the user meant.
        if candidate.as_os_str().is_empty() {
            break;
        }
        if candidate.is_dir() {
            return Ok((candidate.to_path_buf(), false));
        }
        current = candidate.parent();
    }

    Err(SkillsageError::PathNotFound(PathBuf::from(path)))
}

fn open_in_file_manager(path: &Path) -> Result<(), SkillsageError> {
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer.exe");
    #[cfg(target_os = "windows")]
    command.arg(path);

    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "macos")]
    command.arg(path);

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    #[cfg(all(unix, not(target_os = "macos")))]
    command.arg(path);

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| SkillsageError::Io(format!("打开目录失败：{error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "skillsage-open-{label}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).expect("temp root");
        base
    }

    #[test]
    fn an_existing_directory_resolves_to_itself() {
        let root = temp_root("exact");
        let nested = root.join("skills");
        std::fs::create_dir_all(&nested).expect("nested");

        let (target, exact) = resolve_open_target(&nested).expect("resolve");
        assert_eq!(target, nested);
        assert!(exact, "an existing directory must be reported as exact");

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn a_missing_directory_falls_back_to_its_nearest_existing_ancestor() {
        // This is the Cline case: `~/.cline` exists, `~/.cline/skills` does not.
        let root = temp_root("fallback");
        let missing = root.join("skills");

        let (target, exact) = resolve_open_target(&missing).expect("resolve");
        assert_eq!(target, root, "should open the closest directory that exists");
        assert!(!exact, "a fallback must be reported as inexact");

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resolving_never_creates_the_missing_directory() {
        // Creating it would make `ToolResolver::detected` report an uninstalled
        // tool as installed, since it counts the directory or its parent.
        let root = temp_root("ncreate");
        let missing = root.join("a").join("b");

        let (target, exact) = resolve_open_target(&missing).expect("resolve");
        assert_eq!(target, root);
        assert!(!exact);
        assert!(!missing.exists(), "resolving must not create directories");
        assert!(!root.join("a").exists());

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn a_relative_path_does_not_resolve_to_the_working_directory() {
        // `Path::new("nope").parent()` is `Some("")`, and an empty path would
        // otherwise be handed to the file manager as the current directory.
        // This also covers the error branch: nothing in the chain exists.
        let result = resolve_open_target(Path::new("skillsage-definitely-missing-xyz"));
        assert!(
            result.is_err(),
            "a relative path with no existing ancestor must not open anything"
        );
    }

    /// The reported bug, against the real filesystem: Cline's registry entry is
    /// `.cline/skills`, and `~/.cline` exists while `~/.cline/skills` does not.
    /// `#[ignore]`d because it opens a real file-manager window.
    #[tokio::test]
    #[ignore = "opens a real file-manager window"]
    async fn a_missing_tool_directory_falls_back_to_its_parent() {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .expect("a home directory");
        let missing = PathBuf::from(&home).join(".cline").join("skills");
        if !PathBuf::from(&home).join(".cline").is_dir() {
            println!("~/.cline does not exist here; skipping");
            return;
        }

        let result = open_path(missing.to_string_lossy().into_owned())
            .await
            .expect("open_path should not fail for a missing directory");
        assert!(!result.exact, "a missing directory must be reported as inexact");
        assert_eq!(
            PathBuf::from(&result.opened),
            PathBuf::from(&home).join(".cline")
        );
        assert!(
            !missing.exists(),
            "resolving must not have created the missing directory"
        );
    }

    /// An existing directory opens as-is, so the fallback never masks the
    /// normal case.
    #[tokio::test]
    #[ignore = "opens a real file-manager window"]
    async fn an_existing_directory_opens_exactly() {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .expect("a home directory");
        let result = open_path(home.clone())
            .await
            .expect("open_path should succeed for an existing directory");
        assert!(result.exact);
        assert_eq!(PathBuf::from(&result.opened), PathBuf::from(&home));
    }
}
