use tauri::State;

use crate::core::tools::detection::{self, DetectedTools};
use crate::error::SkillsageError;
use crate::state::AppState;

#[tauri::command]
pub async fn detect_tools(_state: State<'_, AppState>) -> Result<DetectedTools, SkillsageError> {
    tokio::task::spawn_blocking(detection::detect_tools)
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}
