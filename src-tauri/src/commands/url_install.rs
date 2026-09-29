use serde::Serialize;
use tauri::State;

use crate::core::github::client::GitHubClient;
use crate::core::lifecycle::install::InstallResult;
use crate::core::repo::conflict::ConflictAction;
use crate::core::repo::layout::RepoLayout;
use crate::core::{settings, url_install};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubUrlInspection {
    pub parsed: url_install::GitHubUrlResult,
    pub skills: Vec<url_install::UrlSkillCandidate>,
    /// The exact commit the candidates were read from. The frontend echoes this
    /// back to `url_install` so the install is pinned to what was previewed
    /// rather than re-resolving a branch that may have moved.
    pub resolved_commit: String,
}

/// `settings::load_runtime` does blocking filesystem and keyring work; keep it
/// off the async runtime.
async fn runtime_settings() -> Result<settings::RuntimeSettings, SkillsageError> {
    tokio::task::spawn_blocking(|| settings::load_runtime(&RepoLayout::from_user_home()?))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn inspect_github_url(url: String) -> Result<GithubUrlInspection, SkillsageError> {
    let runtime = runtime_settings().await?;
    let client = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    let (parsed, skills, resolved_commit) = url_install::resolve_skills(&client, &url).await?;
    Ok(GithubUrlInspection {
        parsed,
        skills,
        resolved_commit,
    })
}

#[tauri::command]
pub async fn url_install(
    url: String,
    skill_path: Option<String>,
    resolved_commit: Option<String>,
    conflict_action: Option<ConflictAction>,
    state: State<'_, AppState>,
) -> Result<InstallResult, SkillsageError> {
    let runtime = runtime_settings().await?;
    let client = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    // Pin the install to the commit the preview was read from, so content pushed
    // to the branch after the preview cannot be installed in its place.
    let detail =
        url_install::resolve_detail(&client, &url, skill_path, resolved_commit.as_deref()).await?;
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        crate::core::lifecycle::install::install_skill_from_store_at(
            &layout,
            detail,
            conflict_action,
        )
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
