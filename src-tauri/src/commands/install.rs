use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::core::lifecycle::install::{self, InstallResult};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillProgress {
    pub skill_id: String,
    pub stage: String,
    pub message: String,
}

#[tauri::command]
pub async fn install_test_skill(
    agents: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<InstallResult, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    emit_progress(&app, "downloading", "准备 Phase 2 测试技能")?;
    emit_progress(&app, "parsing", "解析并校验 SKILL.md")?;
    emit_progress(&app, "distributing", "创建工具目录分发链接")?;
    let result = tokio::task::spawn_blocking(move || install::install_test_skill(agents))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))??;
    emit_progress(&app, "done", "技能已落库并完成分发")?;
    Ok(result)
}

fn emit_progress(app: &AppHandle, stage: &str, message: &str) -> Result<(), SkillsageError> {
    app.emit(
        "skill-progress",
        SkillProgress {
            skill_id: install::TEST_SKILL_ID.to_string(),
            stage: stage.to_string(),
            message: message.to_string(),
        },
    )
    .map_err(|error| SkillsageError::Task(error.to_string()))
}
