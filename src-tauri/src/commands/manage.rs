use serde::Serialize;
use tauri::State;

use crate::core::lifecycle::install;
use crate::core::repo::{layout::RepoLayout, lockfile::SkillLockRecord};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillsList {
    pub skills: Vec<SkillLockRecord>,
}

#[tauri::command]
pub async fn list_installed() -> Result<InstalledSkillsList, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        let lock = crate::core::repo::lockfile::load(&layout)?;
        Ok(InstalledSkillsList {
            skills: lock.skills.into_values().collect(),
        })
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn uninstall_skill(
    skill_id: String,
    state: State<'_, AppState>,
) -> Result<(), SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || install::uninstall_skill(&skill_id))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}
