use std::collections::BTreeMap;

use serde::Deserialize;
use tauri::State;

use crate::commands::manage::tool_resolver;
use crate::core::distribution;
use crate::core::tools::{self, ToolView};
use crate::core::{repo::layout::RepoLayout, settings};
use crate::error::SkillsageError;
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub github_token: Option<String>,
    #[serde(default)]
    pub clear_github_token: bool,
}

#[tauri::command]
pub async fn get_settings() -> Result<settings::SettingsView, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        settings::load_view(&layout)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn set_settings(
    update: SettingsUpdate,
    state: State<'_, AppState>,
) -> Result<settings::SettingsView, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        settings::save(
            &layout,
            update.proxy_url,
            update.github_token,
            update.clear_github_token,
        )
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn get_skill_translations() -> Result<BTreeMap<String, String>, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        settings::load_translations(&layout)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn save_skill_translation(
    skill_id: String,
    translated_description: String,
    state: State<'_, AppState>,
) -> Result<(), SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        settings::save_translation(&layout, skill_id, translated_description)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

/// Every registered tool with its resolved directory, detected state and
/// effective shared-directory flag, so Settings can show the whole picture
/// rather than only what happens to be installed.
#[tauri::command]
pub async fn list_tools() -> Result<Vec<ToolView>, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        let resolver = tool_resolver(&layout)?;
        Ok(tools::list(&resolver))
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

/// Saves one tool's override, then reconciles the links on disk with the new
/// rule. Turning "reads shared directory" on removes the now-redundant links;
/// turning it off leaves the tool ready to be distributed into again.
#[tauri::command]
pub async fn set_tool_override(
    tool_id: String,
    reads_shared: Option<bool>,
    skills_dir: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ToolView>, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        settings::save_tool_override(&layout, tool_id.clone(), reads_shared, skills_dir)?;
        let resolver = tool_resolver(&layout)?;

        // The rule changed, so bring the filesystem in line: drop links for any
        // tool that now reads the shared directory.
        if let Some(tool) = tools::find(&tool_id) {
            if resolver.reads_shared(tool) {
                let lock = crate::core::repo::lockfile::load(&layout)?;
                for record in lock.skills.values() {
                    if let Err(error) = distribution::remove_owned_link_for(
                        &layout, &resolver, record, tool,
                    ) {
                        tracing::warn!(
                            skill = %record.name,
                            tool = %tool.id,
                            error = %error,
                            "切换为读取公共目录后无法移除旧链接"
                        );
                    }
                }
            }
        }
        // Recompute what is actually linked, so the stored list never claims a
        // tool that no longer needs one.
        distribution::refresh_all(&layout, &resolver)?;
        Ok(tools::list(&resolver))
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}
