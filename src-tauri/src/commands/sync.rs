use serde::{Deserialize, Serialize};
use tauri::State;

use crate::core::lifecycle::install::{self, InstallResult};
use crate::core::lifecycle::remote;
use crate::core::paths;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::store::models::SkillDetail;
use crate::core::sync::{export, import};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncImportFailure {
    pub id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncImportResult {
    pub imported: Vec<InstallResult>,
    pub skipped: Vec<String>,
    pub failed: Vec<SyncImportFailure>,
    pub settings: Option<export::SyncSettings>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncImportOptions {
    #[serde(default)]
    pub selected_ids: Vec<String>,
    #[serde(default)]
    pub apply_settings: bool,
}

#[tauri::command]
pub async fn export_package(
    destination: String,
    sync_settings: Option<export::SyncSettings>,
) -> Result<String, SkillsageError> {
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        export::export_at(&layout, &destination, sync_settings.unwrap_or_default())
            .map(|path| paths::display(&path))
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn preview_import_package(
    path: String,
) -> Result<import::SyncImportPreview, SkillsageError> {
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        import::preview_at(&layout, &path)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn import_package(
    path: String,
    options: Option<SyncImportOptions>,
    state: State<'_, AppState>,
) -> Result<SyncImportResult, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    let layout = RepoLayout::from_user_home()?;
    let package = import::load(&path)?;
    let options = options.unwrap_or_default();
    let settings = if options.apply_settings {
        package.settings.clone()
    } else {
        None
    };
    if let Some(sync_settings) = &settings {
        crate::core::settings::save(&layout, sync_settings.proxy_url.clone(), None, false)?;
    }
    let selected = import::selected_entries(&package, &options.selected_ids)?;
    let existing = lockfile::load(&layout)?;
    let mut result = SyncImportResult {
        imported: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
        settings,
    };

    for entry in selected {
        if existing.skills.contains_key(&entry.id)
            || existing
                .skills
                .values()
                .any(|record| record.name == entry.name)
        {
            result.skipped.push(entry.id);
            continue;
        }

        let record = lockfile::SkillLockRecord {
            id: entry.id.clone(),
            name: entry.name.clone(),
            owner: entry.owner.clone(),
            repo: entry.repo.clone(),
            skill_path: entry.skill_path.clone(),
            source: entry.source.clone(),
            current_version: entry.current_version.clone(),
            current_hash: entry.current_hash.clone(),
            installed_at: String::new(),
            version_history: Vec::new(),
            description: entry.description.clone(),
        };
        let files = match remote::fetch_at(&record, &entry.current_version).await {
            Ok(files) => files,
            Err(error) => {
                result.failed.push(SyncImportFailure {
                    id: entry.id,
                    reason: error.to_string(),
                });
                continue;
            }
        };
        let detail = SkillDetail {
            id: entry.id.clone(),
            source: format!("{}/{}", entry.owner, entry.repo),
            slug: entry.name.clone(),
            name: entry.name.clone(),
            description: entry.description.clone(),
            license: None,
            installs: 0,
            github_stars: None,
            url: entry.source.clone(),
            skill_path: entry.skill_path.clone(),
            audits: Vec::new(),
            version: Some(entry.current_version.clone()),
            files,
        };
        match install::install_skill_from_store_at(&layout, detail, None) {
            Ok(installed) => result.imported.push(installed),
            Err(error) => result.failed.push(SyncImportFailure {
                id: entry.id,
                reason: error.to_string(),
            }),
        }
    }
    Ok(result)
}
