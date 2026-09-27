use tauri::State;

use crate::core::store::{
    client::StoreClient,
    models::{LeaderboardRange, SkillDetail, SkillSearchResult},
};
use crate::core::{repo::layout::RepoLayout, settings};
use crate::error::SkillsageError;
use crate::state::AppState;

/// `settings::load_runtime` performs blocking filesystem work and a blocking OS
/// keyring read. Run it on the blocking pool so store commands do not stall a
/// tokio worker thread before their network work even starts.
async fn runtime_settings() -> Result<settings::RuntimeSettings, SkillsageError> {
    tokio::task::spawn_blocking(|| settings::load_runtime(&RepoLayout::from_user_home()?))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn search_skills(query: String) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let runtime = runtime_settings().await?;
    let client = StoreClient::new_with_proxy(runtime.proxy_url)?;
    client.search(&query).await
}

#[tauri::command]
pub async fn get_leaderboard(
    range: LeaderboardRange,
) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let runtime = runtime_settings().await?;
    let client = StoreClient::new_with_proxy(runtime.proxy_url)?;
    client.leaderboard(range).await
}

#[tauri::command]
pub async fn get_skill_detail(
    skill_id: String,
    _state: State<'_, AppState>,
) -> Result<SkillDetail, SkillsageError> {
    let runtime = runtime_settings().await?;
    let client = StoreClient::new_with_proxy(runtime.proxy_url)?;
    client.detail(&skill_id).await
}

#[tauri::command]
pub async fn translate_skill_description(text: String) -> Result<String, SkillsageError> {
    let runtime = runtime_settings().await?;
    let client = StoreClient::new_with_proxy(runtime.proxy_url)?;
    client.translate_description(&text).await
}
