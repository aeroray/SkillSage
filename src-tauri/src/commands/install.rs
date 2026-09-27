use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::core::claude;
use crate::core::github::{client::GitHubClient, download::fetch_skill_files_with_path};
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
    emit_progress(
        &app,
        &skill_id,
        "downloading",
        "Fetching skill files from skills.sh",
    )?;
    // Blocking filesystem + keyring work, kept off the async runtime.
    let runtime = tokio::task::spawn_blocking(|| settings::load_runtime(&RepoLayout::from_user_home()?))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))??;
    let client = StoreClient::new_with_proxy(runtime.proxy_url.clone())?;
    let mut detail = client.detail(&skill_id).await?;
    let (owner, repo) = detail.source.split_once('/').ok_or_else(|| {
        SkillsageError::InvalidSkill("store skill is not backed by a GitHub repository".into())
    })?;
    let github = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    // One request instead of resolving the default branch and then its head
    // commit separately: the commits list already returns the default branch's
    // newest commit.
    let current_version = github.get_latest_commit_sha(owner, repo).await?;
    detail.version = Some(current_version.clone());
    let requested_skill_path = detail
        .skill_path
        .clone()
        .unwrap_or_else(|| detail.slug.clone());
    let (resolved_skill_path, files) = fetch_skill_files_with_path(
        &github,
        owner,
        repo,
        &current_version,
        &requested_skill_path,
    )
    .await?;
    detail.skill_path = Some(resolved_skill_path);
    detail.files = files;
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
        "Installing skill and distributing to Claude Code",
    )?;
    let _write_guard = state.write_lock.lock().await;
    let result = tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        let result = install::install_skill_from_store_at(&layout, detail, conflict_action)?;
        if let Err(error) = claude::set_at(&layout, &result.id, true) {
            tracing::warn!(
                skill_id = %result.id,
                error = %error,
                "技能已安装，但自动分发到 Claude Code 失败"
            );
        }
        Ok::<InstallResult, SkillsageError>(result)
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
