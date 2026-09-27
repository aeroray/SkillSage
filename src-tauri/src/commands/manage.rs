use serde::Serialize;
use tauri::State;

use crate::core::claude;
use crate::core::distribution::DistributionTarget;
use crate::core::github::client::GitHubClient;
use crate::core::lifecycle::{install, match_local, remote, update};
use crate::core::migrate::classifier::find_legacy_remote;
use crate::core::paths;
use crate::core::repo::{layout::RepoLayout, lockfile::SkillLockRecord};
use crate::core::settings;
use crate::core::store::client::StoreClient;
use crate::core::workbuddy;
use crate::error::SkillsageError;
use crate::state::AppState;

/// Cap on simultaneous per-skill update checks. Each check issues several
/// GitHub requests, so the fan-out stays bounded to protect the API quota.
const MAX_CONCURRENT_UPDATE_CHECKS: usize = 4;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillsList {
    pub skills_root: String,
    pub skills: Vec<SkillLockRecord>,
}

#[tauri::command]
pub async fn refresh_installed() -> Result<InstalledSkillsList, SkillsageError> {
    tokio::task::spawn_blocking(|| {
        let layout = RepoLayout::from_user_home()?;
        let lock = crate::core::repo::lockfile::load(&layout)?;
        let skills = lock
            .skills
            .into_values()
            .map(|mut record| {
                record.claude_distributed = claude::is_distributed_at(&layout, &record)?;
                record.workbuddy_distributed = workbuddy::is_distributed_at(&layout, &record)?;
                Ok(record)
            })
            .collect::<Result<Vec<_>, SkillsageError>>()?;
        Ok(InstalledSkillsList {
            skills_root: paths::display(&layout.public_root),
            skills,
        })
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn search_local_skill_matches(
    skill_id: String,
    exhaustive: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<match_local::LocalSkillMatch>, SkillsageError> {
    let cache_skill_id = skill_id.clone();
    let (name, local_hash, local_skill_md, preferred) = tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        let record = load_record(&layout, &skill_id)?;
        if !record.source.starts_with("local://") {
            return Err(SkillsageError::InvalidSkill(
                "只有本地来源技能可以进行在线匹配".into(),
            ));
        }
        let destination = layout.skill(&record.name)?;
        let local_hash = crate::core::repo::lockfile::content_hash(&destination)?;
        let local_skill_md = std::fs::read_to_string(destination.join("SKILL.md"))?;
        let preferred = dirs::home_dir()
            .and_then(|home| find_legacy_remote(&home, &record.name))
            // SkillSage currently tracks the resolved commit, not a persistent
            // branch/tag constraint. Do not silently turn an explicitly pinned
            // NPX install into a default-branch update source.
            .filter(|source| source.version.is_empty())
            .map(|source| match_local::PreferredRemote {
                owner: source.owner,
                repo: source.repo,
                skill_path: source.skill_path,
                source_url: source.source,
            });
        Ok::<_, SkillsageError>((record.name, local_hash, local_skill_md, preferred))
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))??;
    let exhaustive = exhaustive.unwrap_or(false);
    let preferred_key = preferred
        .as_ref()
        .map(|source| {
            format!(
                "{}/{}:{}",
                source.owner,
                source.repo,
                source.skill_path.as_deref().unwrap_or_default()
            )
        })
        .unwrap_or_default();
    let cache_key = format!("{cache_skill_id}\0{local_hash}\0{preferred_key}\0{exhaustive}");
    if let Some(cached) = state
        .local_match_cache
        .lock()
        .await
        .get(&cache_key)
        .cloned()
    {
        return Ok(cached);
    }

    let search_cache_key = name.to_lowercase();
    let cached_candidates = state
        .local_match_search_cache
        .lock()
        .await
        .get(&search_cache_key)
        .cloned();
    let prior_matches = if exhaustive {
        let default_key = format!("{cache_skill_id}\0{local_hash}\0{preferred_key}\0false");
        state
            .local_match_cache
            .lock()
            .await
            .get(&default_key)
            .cloned()
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let runtime = tokio::task::spawn_blocking(|| {
        settings::load_runtime(&RepoLayout::from_user_home()?)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))??;
    let store_client = StoreClient::new_with_proxy(runtime.proxy_url.clone())?;
    let github_client = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    let (matches, searched_candidates) = match_local::search(
        &store_client,
        &github_client,
        match_local::SearchRequest {
            name: &name,
            local_hash: &local_hash,
            local_skill_md: &local_skill_md,
            preferred,
            exhaustive,
            cached_candidates,
            prior_matches,
        },
    )
    .await?;
    if !searched_candidates.is_empty() {
        let mut search_cache = state.local_match_search_cache.lock().await;
        if search_cache.len() >= 32 {
            search_cache.clear();
        }
        search_cache.insert(search_cache_key, searched_candidates);
    }
    let mut cache = state.local_match_cache.lock().await;
    if cache.len() >= 64 {
        cache.clear();
    }
    cache.insert(cache_key, matches.clone());
    Ok(matches)
}

#[tauri::command]
pub async fn link_local_skill(
    skill_id: String,
    remote_skill_id: String,
    remote_version: Option<String>,
    state: State<'_, AppState>,
) -> Result<SkillLockRecord, SkillsageError> {
    let layout = RepoLayout::from_user_home()?;
    let name = {
        let layout = layout.clone();
        let skill_id = skill_id.clone();
        tokio::task::spawn_blocking(move || {
            let record = load_record(&layout, &skill_id)?;
            if !record.source.starts_with("local://") {
                return Err(SkillsageError::InvalidSkill(
                    "只有本地来源技能可以进行在线匹配".into(),
                ));
            }
            Ok::<_, SkillsageError>(record.name)
        })
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))??
    };
    // Carry the candidate's verification result through to the link step. The
    // cache holds it alongside the candidate; a candidate resolved fresh via
    // `find` was never content-verified, so it must not be recorded as exact.
    let cached_match = {
        let cache = state.local_match_cache.lock().await;
        cache
            .values()
            .flat_map(|matches| matches.iter())
            .find(|candidate| candidate.candidate.id == remote_skill_id)
            .map(|candidate| {
                (
                    candidate.candidate.clone(),
                    candidate.verification.clone(),
                )
            })
    };
    let (candidate, verification) = match cached_match {
        Some((candidate, verification)) => (candidate, verification),
        None => {
            let runtime = tokio::task::spawn_blocking({
                let layout = layout.clone();
                move || settings::load_runtime(&layout)
            })
            .await
            .map_err(|error| SkillsageError::Task(error.to_string()))??;
            let client = StoreClient::new_with_proxy(runtime.proxy_url)?;
            (
                match_local::find(&client, &name, &remote_skill_id).await?,
                "unverified".to_string(),
            )
        }
    };
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        match_local::link_at(
            &layout,
            &skill_id,
            &candidate,
            remote_version.as_deref(),
            &verification,
        )
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
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

    // Load settings (blocking keyring + filesystem reads) once, off the async
    // runtime, then share a single HTTP client across every check. Previously
    // each skill rebuilt the client and re-read the OS keyring.
    let runtime = tokio::task::spawn_blocking(|| {
        settings::load_runtime(&RepoLayout::from_user_home()?)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))??;
    let github = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;

    // Run checks concurrently but bounded, and keep going when one skill fails,
    // so a single deleted repository or transient network error no longer hides
    // every other available update. The cap matters because each check issues
    // several GitHub requests; an unbounded fan-out over a large library would
    // hit the API rate limit that the serial version avoided.
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_UPDATE_CHECKS));
    let mut jobs = tokio::task::JoinSet::new();
    for record in records {
        let github = github.clone();
        let semaphore = semaphore.clone();
        jobs.spawn(async move {
            let id = record.id.clone();
            let result = match semaphore.acquire_owned().await {
                Ok(_permit) => update::check_with_client(&github, &record).await,
                Err(error) => Err(SkillsageError::Task(error.to_string())),
            };
            (id, result)
        });
    }

    let mut updates = Vec::new();
    while let Some(joined) = jobs.join_next().await {
        match joined {
            Ok((_, Ok(info))) => updates.push(info),
            Ok((id, Err(error))) => {
                tracing::warn!(skill_id = %id, error = %error, "更新检查失败，已跳过该技能");
            }
            Err(error) => {
                tracing::warn!(error = %error, "更新检查任务异常结束");
            }
        }
    }
    Ok(UpdateCheckList { updates })
}

#[tauri::command]
pub async fn update_skill(
    skill_id: String,
    state: State<'_, AppState>,
) -> Result<SkillLockRecord, SkillsageError> {
    let layout = RepoLayout::from_user_home()?;
    let record = load_record(&layout, &skill_id)?;
    if !remote::is_remote_record(&record) {
        return Err(SkillsageError::InvalidSkill(
            "this skill does not have a remote update source".into(),
        ));
    }
    let (version, files) = remote::fetch_latest(&record).await?;
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || update::apply_at(&layout, &skill_id, version, files))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn uninstall_skill(
    skill_id: String,
    state: State<'_, AppState>,
) -> Result<(), SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        install::uninstall_skill_at(&layout, &skill_id)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn set_claude_distribution(
    skill_id: String,
    distributed: bool,
    state: State<'_, AppState>,
) -> Result<SkillLockRecord, SkillsageError> {
    set_distribution(skill_id, distributed, state, DistributionTarget::ClaudeCode).await
}

#[tauri::command]
pub async fn set_workbuddy_distribution(
    skill_id: String,
    distributed: bool,
    state: State<'_, AppState>,
) -> Result<SkillLockRecord, SkillsageError> {
    set_distribution(skill_id, distributed, state, DistributionTarget::WorkBuddy).await
}

async fn set_distribution(
    skill_id: String,
    distributed: bool,
    state: State<'_, AppState>,
    target: DistributionTarget,
) -> Result<SkillLockRecord, SkillsageError> {
    let _write_guard = state.write_lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        match target {
            DistributionTarget::ClaudeCode => claude::set_at(&layout, &skill_id, distributed),
            DistributionTarget::WorkBuddy => workbuddy::set_at(&layout, &skill_id, distributed),
        }
    })
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
