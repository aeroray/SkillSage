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
    pub translations_imported: usize,
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
    let layout = RepoLayout::from_user_home()?;
    // Reading and validating the package file is synchronous I/O (up to the
    // 8 MiB package limit); keep it off the async runtime.
    let package = {
        let path = path.clone();
        tokio::task::spawn_blocking(move || import::load(&path))
            .await
            .map_err(|error| SkillsageError::Task(error.to_string()))??
    };
    let options = options.unwrap_or_default();
    let settings = if options.apply_settings {
        package.settings.clone()
    } else {
        None
    };
    let translations_imported = if options.apply_settings {
        let _write_guard = state.write_lock.lock().await;
        // Persisting settings touches the filesystem and the OS keyring, and
        // merging translations reads and rewrites the settings file.
        let layout_for_settings = layout.clone();
        let sync_settings = settings.clone();
        let translations = package.translated_descriptions.clone();
        tokio::task::spawn_blocking(move || {
            if let Some(sync_settings) = &sync_settings {
                crate::core::settings::save(
                    &layout_for_settings,
                    sync_settings.proxy_url.clone(),
                    None,
                    false,
                )?;
            }
            crate::core::settings::merge_translations(&layout_for_settings, &translations)
        })
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))??
    } else {
        0
    };
    let selected = import::selected_entries(&package, &options.selected_ids)?;
    let mut result = SyncImportResult {
        imported: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
        translations_imported,
        settings,
    };

    for entry in selected {
        // Pre-check on the blocking pool: reading the lockfile is synchronous
        // I/O and would otherwise stall the async runtime once per entry.
        let already_installed = {
            let _write_guard = state.write_lock.lock().await;
            let layout_for_check = layout.clone();
            let entry_id = entry.id.clone();
            let entry_name = entry.name.clone();
            tokio::task::spawn_blocking(move || {
                let existing = lockfile::load(&layout_for_check)?;
                Ok::<_, SkillsageError>(
                    existing.skills.contains_key(&entry_id)
                        || existing
                            .skills
                            .values()
                            .any(|record| record.name == entry_name),
                )
            })
            .await
            .map_err(|error| SkillsageError::Task(error.to_string()))??
        };
        if already_installed {
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
            description: entry.description.clone(),
            claude_distributed: false,
            workbuddy_distributed: false,
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
        let _write_guard = state.write_lock.lock().await;
        // Re-check and install on the blocking pool: the lockfile read and the
        // directory replacement + blake3 hashing are all synchronous work that
        // would otherwise stall a tokio worker while holding the write lock.
        let layout_for_install = layout.clone();
        let entry_id = entry.id.clone();
        let entry_name = entry.name.clone();
        let installed = tokio::task::spawn_blocking(move || {
            let latest_lock = lockfile::load(&layout_for_install)?;
            if latest_lock.skills.contains_key(&entry_id)
                || latest_lock
                    .skills
                    .values()
                    .any(|record| record.name == entry_name)
            {
                return Ok::<_, SkillsageError>(None);
            }
            // An install failure is reported per entry, not as a fatal error
            // for the whole batch.
            Ok(Some(install::install_skill_from_store_at(
                &layout_for_install,
                detail,
                None,
            )))
        })
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))??;
        match installed {
            None => result.skipped.push(entry.id),
            Some(Ok(installed)) => result.imported.push(installed),
            Some(Err(error)) => result.failed.push(SyncImportFailure {
                id: entry.id,
                reason: error.to_string(),
            }),
        }
    }
    Ok(result)
}
