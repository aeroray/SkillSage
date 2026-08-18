use serde::Deserialize;
use tauri::State;

use crate::core::{repo::layout::RepoLayout, settings};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub github_token: Option<String>,
    #[serde(default)]
    pub clear_github_token: bool,
}

#[tauri::command]
pub async fn get_settings() -> Result<settings::SettingsView, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        settings::load_view(&layout)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn set_settings(
    update: SettingsUpdate,
    state: State<'_, AppState>,
) -> Result<settings::SettingsView, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        settings::save(
            &layout,
            update.proxy_url,
            update.github_token,
            update.clear_github_token,
        )
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
