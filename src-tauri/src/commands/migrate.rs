use tauri::State;

use crate::core::migrate::{migrator, scanner};
use crate::core::repo::layout::RepoLayout;
use crate::error::SkillsageError;
use crate::state::AppState;

#[tauri::command]
pub async fn scan_migrate() -> Result<scanner::MigrateScanResult, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        scanner::scan(&layout)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn execute_migrate(
    items: Vec<migrator::MigrateSelection>,
    state: State<'_, AppState>,
) -> Result<migrator::MigrateResult, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        migrator::execute_at(&layout, items)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn remove_migrate_link(
    source_path: String,
    state: State<'_, AppState>,
) -> Result<(), SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        migrator::remove_unknown_link_at(&layout, &source_path)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
