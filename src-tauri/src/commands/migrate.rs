use tauri::State;

use crate::core::migrate::{migrator, scanner};
use crate::core::repo::layout::RepoLayout;
use crate::error::SkillsageError;
use crate::state::AppState;

#[tauri::command]
pub async fn scan_migrate() -> Result<scanner::AdoptScanResult, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        scanner::scan(&layout)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn execute_migrate(
    items: Vec<migrator::AdoptSelection>,
    state: State<'_, AppState>,
) -> Result<migrator::AdoptResult, SkillsageError> {
    let layout = RepoLayout::from_user_home()?;
    migrator::execute_at_with_lock(&layout, items, &state.write_lock).await
}
