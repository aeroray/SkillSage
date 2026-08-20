use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::core::github::{client::GitHubClient, download::fetch_skill_files};
use crate::core::lifecycle::install::{self, InstallResult};
use crate::core::repo::conflict::ConflictAction;
use crate::core::store::client::StoreClient;
use crate::core::{repo::layout::RepoLayout, settings};
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
pub async fn install_skill(
    skill_id: String,
    conflict_action: Option<ConflictAction>,
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
    let runtime = settings::load_runtime(&RepoLayout::from_user_home()?)?;
    let client = StoreClient::new_with_proxy(runtime.proxy_url.clone())?;
    let mut detail = client.detail(&skill_id).await?;
    let (owner, repo) = detail.source.split_once('/').ok_or_else(|| {
        SkillsageError::InvalidSkill("store skill is not backed by a GitHub repository".into())
    })?;
    let github = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
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
        "Storing skill in the shared skills directory",
    )?;
    let result = tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        install::install_skill_from_store_at(&layout, detail, conflict_action)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))??;
    emit_progress(&app, &skill_id, "done", "Skill installed")?;
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
