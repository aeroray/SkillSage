use serde::Deserialize;
use tauri::State;

use crate::core::{cleanup, repo::layout::RepoLayout, settings};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CleanupMode {
    All,
    KeepSkills,
}

#[tauri::command]
pub async fn cleanup_app(
    mode: CleanupMode,
    state: State<'_, AppState>,
) -> Result<cleanup::CleanupResult, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        let mode = match mode {
            CleanupMode::All => cleanup::CleanupMode::All,
            CleanupMode::KeepSkills => cleanup::CleanupMode::KeepSkills,
        };
        let result = cleanup::cleanup_at(&layout, mode)?;
        settings::clear_for_cleanup(&layout)?;
        tracing::info!(
            ?mode,
            tracked_skills_removed = result.tracked_skills_removed,
            "application cleanup completed"
        );
        Ok(result)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
