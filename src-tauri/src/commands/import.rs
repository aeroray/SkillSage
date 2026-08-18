use tauri::State;

use crate::core::import::{self, ImportPreview};
use crate::core::lifecycle::install::InstallResult;
use crate::core::repo::layout::RepoLayout;
use crate::error::SkillsageError;
use crate::state::AppState;

#[tauri::command]
pub async fn preview_local_import(path: String) -> Result<ImportPreview, SkillsageError> {
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        import::preview_at(&layout, &path)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn import_local(
    path: String,
    agents: Vec<String>,
    conflict: String,
    rename_to: Option<String>,
    state: State<'_, AppState>,
) -> Result<InstallResult, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        import::import_at(&layout, &path, agents, &conflict, rename_to)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
