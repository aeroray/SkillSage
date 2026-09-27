use tauri::State;

use crate::core::store::{
    client::StoreClient,
    models::{LeaderboardRange, SkillDetail, SkillSearchResult},
};
use crate::core::{repo::layout::RepoLayout, settings};
use crate::error::SkillsageError;
use crate::state::AppState;

/// The proxy for a store request.
///
/// Deliberately not `load_runtime`: that also reads the GitHub token from the
/// OS keyring, and none of these commands send it 鈥?the store is a public site
/// and translation goes to Sogou. The keyring read is blocking and on macOS can
/// raise a system prompt, so paying for it on every search would be both slow
/// and, on a machine where the user has never saved a token, a prompt for
/// nothing.
async fn store_proxy() -> Result<Option<String>, SkillsageError> {
    tokio::task::spawn_blocking(|| settings::load_proxy(&RepoLayout::from_user_home()?))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn search_skills(query: String) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let client = StoreClient::shared(store_proxy().await?)?;
    client.search(&query).await
}

#[tauri::command]
pub async fn get_leaderboard(
    range: LeaderboardRange,
) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let client = StoreClient::shared(store_proxy().await?)?;
    client.leaderboard(range).await
}

#[tauri::command]
pub async fn get_skill_detail(
    skill_id: String,
    _state: State<'_, AppState>,
) -> Result<SkillDetail, SkillsageError> {
    let client = StoreClient::shared(store_proxy().await?)?;
    client.detail(&skill_id).await
}

#[tauri::command]
pub async fn translate_skill_description(text: String) -> Result<String, SkillsageError> {
    let client = StoreClient::shared(store_proxy().await?)?;
    client.translate_description(&text).await
}
