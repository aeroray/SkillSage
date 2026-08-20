use serde::Serialize;
use tauri::State;

use crate::core::lifecycle::{remote, rollback, uninstall, update};
use crate::core::paths;
use crate::core::repo::{layout::RepoLayout, lockfile::SkillLockRecord};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillsList {
    pub skills_root: String,
    pub skills: Vec<SkillLockRecord>,
}

#[tauri::command]
pub async fn list_installed() -> Result<InstalledSkillsList, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        let lock = crate::core::repo::lockfile::load(&layout)?;
        Ok(InstalledSkillsList {
            skills_root: paths::display(&layout.public_root),
            skills: lock.skills.into_values().collect(),
        })
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn refresh_installed() -> Result<InstalledSkillsList, SkillsageError> {
    list_installed().await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckList {
    pub updates: Vec<update::UpdateInfo>,
}

#[tauri::command]
pub async fn check_updates(
    skill_id: Option<String>,
    skill_ids: Option<Vec<String>>,
) -> Result<UpdateCheckList, SkillsageError> {
    let records = tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        let lock = crate::core::repo::lockfile::load(&layout)?;
        let records = match (skill_id, skill_ids) {
            (Some(id), _) => vec![lock
                .skills
                .get(&id)
                .cloned()
                .ok_or(SkillsageError::NotInstalled(id))?],
            (None, Some(ids)) => ids
                .into_iter()
                .map(|id| {
                    lock.skills
                        .get(&id)
                        .cloned()
                        .ok_or(SkillsageError::NotInstalled(id))
                })
                .collect::<Result<Vec<_>, _>>()?,
            (None, None) => lock.skills.into_values().collect(),
        };
        Ok::<_, SkillsageError>(records)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))??;

    let mut updates = Vec::with_capacity(records.len());
    for record in records {
        updates.push(update::check(&record).await?);
    }
    Ok(UpdateCheckList { updates })
}

#[tauri::command]
pub async fn update_skill(
    skill_id: String,
    state: State<'_, AppState>,
) -> Result<SkillLockRecord, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    let layout = RepoLayout::from_user_home()?;
    let record = load_record(&layout, &skill_id)?;
    if !remote::is_remote_record(&record) {
        return Err(SkillsageError::InvalidSkill(
            "this skill does not have a remote update source".into(),
        ));
    }
    let (version, files) = remote::fetch_latest(&record).await?;
    tokio::task::spawn_blocking(move || update::apply_at(&layout, &skill_id, version, files))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn rollback_skill(
    skill_id: String,
    version: String,
    state: State<'_, AppState>,
) -> Result<SkillLockRecord, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    let layout = RepoLayout::from_user_home()?;
    let record = load_record(&layout, &skill_id)?;
    if !remote::is_remote_record(&record) {
        return Err(SkillsageError::InvalidSkill(
            "this skill does not have a remote rollback source".into(),
        ));
    }
    let target = record
        .version_history
        .iter()
        .find(|entry| entry.commit == version)
        .cloned()
        .ok_or_else(|| {
            SkillsageError::InvalidSkill(
                "requested rollback version is not in the skill history".into(),
            )
        })?;
    let files = match remote::fetch_at(&record, &version).await {
        Ok(files) => files,
        Err(_) => {
            let fallback_layout = layout.clone();
            let fallback_record = record.clone();
            let fallback_hash = target.hash.clone();
            tokio::task::spawn_blocking(move || {
                update::snapshot_files_at(&fallback_layout, &fallback_record, &fallback_hash)
            })
            .await
            .map_err(|error| SkillsageError::Task(error.to_string()))??
        }
    };
    tokio::task::spawn_blocking(move || rollback::apply_at(&layout, &skill_id, version, files))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn uninstall_skill(
    skill_id: String,
    state: State<'_, AppState>,
) -> Result<(), SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || uninstall::uninstall(&skill_id))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

fn load_record(layout: &RepoLayout, skill_id: &str) -> Result<SkillLockRecord, SkillsageError> {
    crate::core::repo::lockfile::load(layout)?
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))
}
