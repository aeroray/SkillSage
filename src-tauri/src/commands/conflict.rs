use crate::core::repo::conflict::{self, InstallConflict};
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::error::SkillsageError;

/// Read-only pre-check: does an untracked foreign path already occupy the
/// flat slot `name` would install into? Lets the frontend decide whether to
/// show the skip/takeover/cancel dialog before attempting the install at
/// all, rather than always attempting and parsing a specific error shape.
#[tauri::command]
pub async fn check_install_conflict(
    name: String,
) -> Result<Option<InstallConflict>, SkillsageError> {
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        let lock = lockfile::load(&layout)?;
        conflict::check(&layout, &lock, &name)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
