use serde::{Deserialize, Serialize};

use crate::core::lifecycle::remote;
use crate::core::repo::conflict;
use crate::core::repo::layout::RepoLayout;
use crate::core::repo::lockfile;
use crate::core::skill::parser::read_skill_md;
use crate::error::SkillsageError;

use super::classifier::{find_legacy_remote, LegacyRemoteSource};
use super::scanner::{scan, AdoptableItem};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptSelection {
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptFailure {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptResult {
    pub adopted: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<AdoptFailure>,
}

/// Brings each selected untracked public-directory folder under SkillSage's
/// tracking. A folder whose name differs from SKILL.md is rejected until the
/// user resolves the mismatch, so the declared skill name remains canonical.
#[cfg(test)]
pub async fn execute_at(
    layout: &RepoLayout,
    selections: Vec<AdoptSelection>,
) -> Result<AdoptResult, SkillsageError> {
    let write_lock = tokio::sync::Mutex::new(());
    execute_at_with_lock(layout, selections, &write_lock).await
}

pub async fn execute_at_with_lock(
    layout: &RepoLayout,
    selections: Vec<AdoptSelection>,
    write_lock: &tokio::sync::Mutex<()>,
) -> Result<AdoptResult, SkillsageError> {
    let scan_result = scan(layout)?;
    let home = dirs::home_dir();
    let mut result = AdoptResult {
        adopted: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
    };

    for selection in selections {
        let Some(item) = scan_result
            .items
            .iter()
            .find(|item| item.name == selection.name)
        else {
            result.failed.push(AdoptFailure {
                name: selection.name,
                reason: "找不到扫描条目，可能已被移动".into(),
            });
            continue;
        };
        if !item.valid {
            result.failed.push(AdoptFailure {
                name: item.name.clone(),
                reason: "未找到有效的 SKILL.md，无法采纳".into(),
            });
            continue;
        }
        if item.declared_name.is_some() {
            result.failed.push(AdoptFailure {
                name: item.name.clone(),
                reason: "请先按 SKILL.md 中的名称整理文件夹".into(),
            });
            continue;
        }

        let prepared = match prepare_adoption(layout, item, home.as_deref()).await {
            Ok(prepared) => prepared,
            Err(error) => {
                result.failed.push(AdoptFailure {
                    name: item.name.clone(),
                    reason: error.to_string(),
                });
                continue;
            }
        };
        let _write_guard = write_lock.lock().await;
        match commit_adoption(layout, prepared) {
            Ok(name) => result.adopted.push(name),
            Err(SkillsageError::NameConflict(_)) => result.skipped.push(item.name.clone()),
            Err(error) => result.failed.push(AdoptFailure {
                name: item.name.clone(),
                reason: error.to_string(),
            }),
        }
    }
    Ok(result)
}

struct PreparedAdoption {
    name: String,
    record: lockfile::SkillLockRecord,
    current_hash: String,
}

async fn prepare_adoption(
    layout: &RepoLayout,
    item: &AdoptableItem,
    home: Option<&std::path::Path>,
) -> Result<PreparedAdoption, SkillsageError> {
    let path = layout.skill(&item.name)?;
    let parsed = read_skill_md(&path.join("SKILL.md"))?;
    let current_hash = lockfile::content_hash(&path)?;

    let legacy = home.and_then(|home| find_legacy_remote(home, &item.name));
    let verified = match legacy {
        Some(candidate) => verify_legacy_source(&item.name, &candidate, &current_hash).await,
        None => None,
    };

    // At this point the scanner has guaranteed that the folder and declared
    // names match. The declared name is therefore canonical for the record.
    let record = match verified {
        Some(candidate) => lockfile::SkillLockRecord {
            id: format!("{}/{}", candidate.owner, item.name),
            name: item.name.clone(),
            owner: candidate.owner,
            repo: candidate.repo,
            skill_path: candidate.skill_path,
            source: candidate.source,
            current_version: candidate.version,
            current_hash: current_hash.clone(),
            installed_at: lockfile::unix_timestamp(),
            version_history: Vec::new(),
            description: parsed.manifest.description,
        },
        None => lockfile::SkillLockRecord {
            id: format!("local/{}", item.name),
            name: item.name.clone(),
            owner: "local".into(),
            repo: "local".into(),
            skill_path: None,
            source: format!("local://{}", item.name),
            current_version: "adopted".into(),
            current_hash: current_hash.clone(),
            installed_at: lockfile::unix_timestamp(),
            version_history: Vec::new(),
            description: parsed.manifest.description,
        },
    };
    Ok(PreparedAdoption {
        name: item.name.clone(),
        record,
        current_hash,
    })
}

fn commit_adoption(
    layout: &RepoLayout,
    prepared: PreparedAdoption,
) -> Result<String, SkillsageError> {
    let path = layout.skill(&prepared.name)?;
    let actual_hash = lockfile::content_hash(&path)?;
    if actual_hash != prepared.current_hash {
        return Err(SkillsageError::Io(format!(
            "技能在采纳前发生变化，请重新扫描: {}",
            path.display()
        )));
    }
    let mut lock = lockfile::load(layout)?;
    if conflict::is_tracked(&lock, &prepared.name) {
        return Err(SkillsageError::NameConflict(prepared.name));
    }
    let name = prepared.name.clone();
    let id = prepared.record.id.clone();
    lock.skills.insert(id.clone(), prepared.record);
    lockfile::save(layout, &lock)?;
    Ok(name)
}

/// A cheap, purely-additive safety net: only trust `classifier`'s cross-tool
/// lock-sniffed provenance guess if re-fetching that exact commit produces
/// content that hashes identically to what's actually on disk. Trusting an
/// unverified guess risks a future "update" silently overwriting this
/// folder with unrelated bytes from the wrong repository. Worst case (no
/// match, or offline) falls back to an unversioned `local://` record —
/// identical to skipping cross-tool recovery entirely.
async fn verify_legacy_source(
    name: &str,
    candidate: &LegacyRemoteSource,
    current_hash: &str,
) -> Option<LegacyRemoteSource> {
    let probe = lockfile::SkillLockRecord {
        id: String::new(),
        name: name.to_string(),
        owner: candidate.owner.clone(),
        repo: candidate.repo.clone(),
        skill_path: candidate.skill_path.clone(),
        source: candidate.source.clone(),
        current_version: candidate.version.clone(),
        current_hash: String::new(),
        installed_at: String::new(),
        version_history: Vec::new(),
        description: String::new(),
    };
    let files = remote::fetch_at(&probe, &candidate.version).await.ok()?;
    let fetched_hash = lockfile::content_hash_files(
        &files
            .iter()
            .map(|file| (file.path.replace('\\', "/"), file.contents.clone()))
            .collect::<Vec<_>>(),
    );
    (fetched_hash == current_hash).then(|| candidate.clone())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{execute_at, AdoptSelection};
    use crate::core::repo::{layout::RepoLayout, lockfile};

    fn test_layout(name: &str) -> RepoLayout {
        let root = std::env::temp_dir().join(format!(
            "skillsage-adopt-execute-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        RepoLayout::new(root.join("central"), root.join("public"))
    }

    #[tokio::test]
    async fn adopts_an_untracked_skill_in_place_without_moving_it() {
        let layout = test_layout("basic");
        layout.ensure_roots().expect("create layout");
        let folder = layout.public_root.join("found-skill");
        fs::create_dir_all(&folder).expect("create dir");
        fs::write(
            folder.join("SKILL.md"),
            "---\nname: found-skill\ndescription: Found on disk.\n---\n",
        )
        .expect("write manifest");

        let result = execute_at(
            &layout,
            vec![AdoptSelection {
                name: "found-skill".into(),
            }],
        )
        .await
        .expect("adopt should succeed");
        assert_eq!(result.adopted, vec!["found-skill".to_string()]);
        assert!(folder.is_dir(), "content must stay exactly where it was");

        let lock = lockfile::load(&layout).expect("lock should load");
        assert!(lock
            .skills
            .values()
            .any(|record| record.name == "found-skill" && record.source == "local://found-skill"));

        fs::remove_dir_all(&layout.root).expect("remove central root");
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }
}
