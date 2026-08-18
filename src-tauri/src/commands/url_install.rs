use std::collections::BTreeMap;

use serde::Serialize;
use tauri::State;

use crate::core::github::client::GitHubClient;
use crate::core::lifecycle::install::InstallResult;
use crate::core::repo::layout::RepoLayout;
use crate::core::{settings, url_install};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubUrlInspection {
    pub parsed: url_install::GitHubUrlResult,
    pub skills: Vec<url_install::UrlSkillCandidate>,
}

#[tauri::command]
pub async fn inspect_github_url(url: String) -> Result<GithubUrlInspection, SkillsageError> {
    let runtime = settings::load_runtime(&RepoLayout::from_user_home()?)?;
    let client = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    let (parsed, skills) = url_install::resolve_skills(&client, &url).await?;
    Ok(GithubUrlInspection { parsed, skills })
}

#[tauri::command]
pub async fn url_install(
    url: String,
    skill_path: Option<String>,
    agents: Vec<String>,
    conflicts: Option<BTreeMap<String, String>>,
    state: State<'_, AppState>,
) -> Result<InstallResult, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    let runtime = settings::load_runtime(&RepoLayout::from_user_home()?)?;
    let client = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    let detail = url_install::resolve_detail(&client, &url, skill_path).await?;
    tokio::task::spawn_blocking(move || {
        crate::core::lifecycle::install::install_skill_from_store_with_conflicts(
            detail,
            agents,
            conflicts.unwrap_or_default(),
        )
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
