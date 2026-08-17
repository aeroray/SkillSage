use tauri::State;

use crate::core::store::{
    client::StoreClient,
    models::{LeaderboardRange, SkillDetail, SkillSearchResult},
};
use crate::error::SkillsageError;
use crate::state::AppState;

#[tauri::command]
pub async fn search_skills(query: String) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let client = StoreClient::new()?;
    client.search(&query).await
}

#[tauri::command]
pub async fn get_leaderboard(
    range: LeaderboardRange,
) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let client = StoreClient::new()?;
    client.leaderboard(range).await
}

#[tauri::command]
pub async fn get_skill_detail(
    skill_id: String,
    _state: State<'_, AppState>,
) -> Result<SkillDetail, SkillsageError> {
    let client = StoreClient::new()?;
    client.detail(&skill_id).await
}
