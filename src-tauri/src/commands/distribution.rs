use crate::core::distribute::conflict::{self, DistributionConflict};
use crate::core::repo::layout::RepoLayout;
use crate::error::SkillsageError;

#[tauri::command]
pub async fn check_distribution_conflicts(
    skill_name: String,
    agents: Vec<String>,
) -> Result<Vec<DistributionConflict>, SkillsageError> {
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        conflict::find_for_skill(&layout, &skill_name, &agents)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
