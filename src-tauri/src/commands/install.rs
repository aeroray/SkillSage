use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::core::github::{client::GitHubClient, download::fetch_skill_files};
use crate::core::lifecycle::install::{self, InstallResult};
use crate::core::store::client::StoreClient;
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
    emit_progress(
        &app,
        install::TEST_SKILL_ID,
        "downloading",
        "Preparing the Phase 2 test skill",
    )?;
    emit_progress(
        &app,
        install::TEST_SKILL_ID,
        "parsing",
        "Parsing and validating SKILL.md",
    )?;
    emit_progress(
        &app,
        install::TEST_SKILL_ID,
        "distributing",
        "Creating tool distribution links",
    )?;
    let result = tokio::task::spawn_blocking(move || install::install_test_skill(agents))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))??;
    emit_progress(
        &app,
        install::TEST_SKILL_ID,
        "done",
        "Skill stored and distributed",
    )?;
    Ok(result)
}

#[tauri::command]
pub async fn install_skill(
    skill_id: String,
    agents: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<InstallResult, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    emit_progress(
        &app,
        &skill_id,
        "downloading",
        "Fetching skill files from skills.sh",
    )?;
    let client = StoreClient::new()?;
    let mut detail = client.detail(&skill_id).await?;
    let (owner, repo) = detail.source.split_once('/').ok_or_else(|| {
        SkillsageError::InvalidSkill("store skill is not backed by a GitHub repository".into())
    })?;
    let github = GitHubClient::new(None)?;
    let default_branch = github.get_default_branch(owner, repo).await?;
    let current_version = github.get_commit_sha(owner, repo, &default_branch).await?;
    detail.version = Some(current_version.clone());
    detail.files = fetch_skill_files(&github, owner, repo, &current_version, &detail.slug).await?;
    emit_progress(
        &app,
        &skill_id,
        "parsing",
        "Parsing and validating SKILL.md",
    )?;
    emit_progress(
        &app,
        &skill_id,
        "distributing",
        "Creating tool distribution links",
    )?;
    let result =
        tokio::task::spawn_blocking(move || install::install_skill_from_store(detail, agents))
            .await
            .map_err(|error| SkillsageError::Task(error.to_string()))??;
    emit_progress(&app, &skill_id, "done", "Skill stored and distributed")?;
    Ok(result)
}

fn emit_progress(
    app: &AppHandle,
    skill_id: &str,
    stage: &str,
    message: &str,
) -> Result<(), SkillsageError> {
    app.emit(
        "skill-progress",
        SkillProgress {
            skill_id: skill_id.to_string(),
            stage: stage.to_string(),
            message: message.to_string(),
        },
    )
    .map_err(|error| SkillsageError::Task(error.to_string()))
}
