use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use crate::core::paths;
use crate::core::repo::conflict::{self, ConflictAction};
use crate::core::repo::{atomic, layout::RepoLayout, lockfile};
use crate::core::skill::parser::read_skill_md;
use crate::core::store::models::SkillDetail;
use crate::error::SkillsageError;

#[cfg(test)]
pub const TEST_SKILL_ID: &str = "skillsage/skillsage-phase2-test";
#[cfg(test)]
const TEST_SKILL_OWNER: &str = "skillsage";
#[cfg(test)]
const TEST_SKILL_REPO: &str = "skillsage-phase2-test";
#[cfg(test)]
const TEST_SKILL_COMMIT: &str = "phase2-fixture";

#[cfg(test)]
const TEST_SKILL_MD: &str = r#"---
name: skillsage-phase2-test
description: A built-in verification skill for the SkillSage install pipeline.
license: MIT
metadata:
  phase: "2"
  source: "built-in-fixture"
---

# SkillSage Phase 2 Test Skill

Use this skill to verify that SkillSage can validate, store, hash, and distribute a skill.
"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub current_version: String,
    pub current_hash: String,
    pub install_path: String,
}

pub fn install_skill_from_store_at(
    layout: &RepoLayout,
    detail: SkillDetail,
    conflict_action: Option<ConflictAction>,
) -> Result<InstallResult, SkillsageError> {
    let (owner, repo) = detail.source.split_once('/').ok_or_else(|| {
        SkillsageError::InvalidSkill("only GitHub-backed store skills are supported".into())
    })?;
    if owner.is_empty() || repo.is_empty() || repo.contains('/') || detail.id.is_empty() {
        return Err(SkillsageError::InvalidSkill(
            "store skill source is not a valid GitHub repository".into(),
        ));
    }
    if detail.files.is_empty() {
        return Err(SkillsageError::InvalidStoreData(
            "store skill has no downloadable files".into(),
        ));
    }

    layout.ensure_roots()?;
    let temp_dir = atomic::create_temp_dir(layout)?;
    for file in &detail.files {
        let relative = match safe_file_path(&file.path) {
            Ok(value) => value,
            Err(error) => {
                let _ = atomic::remove_dir(&temp_dir);
                return Err(error);
            }
        };
        let target = temp_dir.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if let Err(error) = std::fs::write(target, &file.contents) {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error.into());
        }
    }

    let skill_file = temp_dir.join("SKILL.md");
    let parsed = match read_skill_md(&skill_file) {
        Ok(value) => value,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };
    let current_hash = match lockfile::content_hash(&temp_dir) {
        Ok(value) => value,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };

    let lock = match lockfile::load(layout) {
        Ok(value) => value,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };
    if lock.skills.contains_key(&detail.id) {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(SkillsageError::AlreadyInstalled(detail.id));
    }
    if conflict::is_tracked(&lock, &parsed.manifest.name) {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(SkillsageError::NameConflict(parsed.manifest.name));
    }

    let destination = match layout.skill(&parsed.manifest.name) {
        Ok(path) => path,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };
    let pending = match conflict::check(layout, &lock, &parsed.manifest.name) {
        Ok(None) => None,
        Ok(Some(found)) => match conflict_action {
            Some(ConflictAction::Takeover) => {
                match conflict::take_over(layout, &parsed.manifest.name) {
                    Ok(pending) => Some(pending),
                    Err(error) => {
                        let _ = atomic::remove_dir(&temp_dir);
                        return Err(error);
                    }
                }
            }
            _ => {
                let _ = atomic::remove_dir(&temp_dir);
                return Err(SkillsageError::InstallConflict(format!(
                    "{}: {}",
                    found.name, found.path
                )));
            }
        },
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };

    if let Err(error) = atomic::commit_dir(&temp_dir, &destination) {
        let _ = atomic::remove_dir(&temp_dir);
        if let Some(pending) = pending {
            let _ = pending.restore();
        }
        return Err(error);
    }

    let current_version = detail
        .version
        .clone()
        .unwrap_or_else(|| "skills.sh".to_string());
    let record = lockfile::SkillLockRecord {
        id: detail.id.clone(),
        name: parsed.manifest.name.clone(),
        owner: owner.to_string(),
        repo: repo.to_string(),
        skill_path: detail
            .skill_path
            .clone()
            .or_else(|| Some(detail.slug.clone())),
        source: detail.url,
        current_version: current_version.clone(),
        current_hash: current_hash.clone(),
        installed_at: lockfile::unix_timestamp(),
        version_history: Vec::new(),
        description: detail.description,
    };
    let mut lock = lock;
    lock.skills.insert(detail.id.clone(), record);

    if let Err(error) = lockfile::save(layout, &lock) {
        let _ = atomic::remove_dir(&destination);
        if let Some(pending) = pending {
            let _ = pending.restore();
        }
        return Err(error);
    }

    Ok(InstallResult {
        id: detail.id,
        name: parsed.manifest.name,
        owner: owner.to_string(),
        current_version,
        current_hash,
        install_path: paths::display(&destination),
    })
}

#[cfg(test)]
pub fn install_test_skill_at(layout: &RepoLayout) -> Result<InstallResult, SkillsageError> {
    layout.ensure_roots()?;
    let temp_dir = atomic::create_temp_dir(layout)?;
    let temporary_skill_file = temp_dir.join("SKILL.md");
    std::fs::write(&temporary_skill_file, TEST_SKILL_MD)?;

    let parsed = match read_skill_md(&temporary_skill_file) {
        Ok(value) => value,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };
    let current_hash = match lockfile::content_hash(&temp_dir) {
        Ok(value) => value,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };
    let destination = layout.skill(&parsed.manifest.name)?;
    if destination.exists() {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(SkillsageError::AlreadyInstalled(TEST_SKILL_ID.to_string()));
    }

    if let Err(error) = atomic::commit_dir(&temp_dir, &destination) {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(error);
    }

    let mut lock = match lockfile::load(layout) {
        Ok(value) => value,
        Err(error) => {
            let _ = atomic::remove_dir(&destination);
            return Err(error);
        }
    };
    if lock.skills.contains_key(TEST_SKILL_ID) {
        let _ = atomic::remove_dir(&destination);
        return Err(SkillsageError::AlreadyInstalled(TEST_SKILL_ID.to_string()));
    }

    let record = lockfile::SkillLockRecord {
        id: TEST_SKILL_ID.to_string(),
        name: parsed.manifest.name.clone(),
        owner: TEST_SKILL_OWNER.to_string(),
        repo: TEST_SKILL_REPO.to_string(),
        skill_path: None,
        source: "builtin://phase2-fixture".to_string(),
        current_version: TEST_SKILL_COMMIT.to_string(),
        current_hash: current_hash.clone(),
        installed_at: lockfile::unix_timestamp(),
        version_history: Vec::new(),
        description: parsed.manifest.description.clone(),
    };
    lock.skills.insert(TEST_SKILL_ID.to_string(), record);

    if let Err(error) = lockfile::save(layout, &lock) {
        let _ = atomic::remove_dir(&destination);
        return Err(error);
    }

    Ok(InstallResult {
        id: TEST_SKILL_ID.to_string(),
        name: parsed.manifest.name,
        owner: TEST_SKILL_OWNER.to_string(),
        current_version: TEST_SKILL_COMMIT.to_string(),
        current_hash,
        install_path: paths::display(&destination),
    })
}

pub fn uninstall_skill_at(layout: &RepoLayout, skill_id: &str) -> Result<(), SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let record = lock
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;

    let destination = destination_for_record(layout, &record)?;
    let snapshots = if record.source.starts_with("local://") {
        None
    } else {
        Some(layout.snapshot_skill(&record.name)?)
    };
    atomic::remove_dir(&destination)?;
    if let Some(snapshots) = snapshots {
        atomic::remove_dir(&snapshots)?;
    }
    lock.skills.remove(skill_id);
    lockfile::save(layout, &lock)?;
    Ok(())
}

/// Where a record's content lives on disk. Every skill, regardless of
/// source (`remote://`/`https://`/`local://`), lives at the same flat
/// `layout.skill(name)` path now — there is no more owner-namespaced
/// "remote" tree distinct from a flat "local" tree.
pub fn destination_for_record(
    layout: &RepoLayout,
    record: &lockfile::SkillLockRecord,
) -> Result<PathBuf, SkillsageError> {
    layout.skill(&record.name)
}

fn safe_file_path(value: &str) -> Result<PathBuf, SkillsageError> {
    let path = Path::new(value);
    if value.is_empty() || path.is_absolute() {
        return Err(SkillsageError::InvalidStoreData(format!(
            "unsafe skill file path: {value}"
        )));
    }

    let mut relative = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => relative.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(SkillsageError::InvalidStoreData(format!(
                    "unsafe skill file path: {value}"
                )))
            }
        }
    }
    if relative.as_os_str().is_empty() {
        return Err(SkillsageError::InvalidStoreData(format!(
            "unsafe skill file path: {value}"
        )));
    }
    Ok(relative)
}

#[cfg(test)]
pub fn test_skill_path(layout: &RepoLayout) -> Result<PathBuf, SkillsageError> {
    layout.skill("skillsage-phase2-test")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{install_test_skill_at, test_skill_path, uninstall_skill_at, TEST_SKILL_ID};
    use crate::core::lifecycle::update::apply_at;
    use crate::core::repo::layout::RepoLayout;
    use crate::core::store::models::SkillFile;

    fn test_layout(name: &str) -> RepoLayout {
        let root =
            std::env::temp_dir().join(format!("skillsage-install-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        RepoLayout::new(root.join("central"), root.join("public"))
    }

    #[test]
    fn installs_and_uninstalls_fixture_without_distribution() {
        let layout = test_layout("basic");
        let root = layout.root.parent().expect("root parent").to_path_buf();

        let result = install_test_skill_at(&layout).expect("fixture should install");
        assert_eq!(result.id, TEST_SKILL_ID);
        assert!(test_skill_path(&layout)
            .expect("path should resolve")
            .is_dir());
        assert!(layout.lock_path().is_file());

        uninstall_skill_at(&layout, TEST_SKILL_ID).expect("fixture should uninstall");
        assert!(!test_skill_path(&layout)
            .expect("path should resolve")
            .exists());
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn uninstall_removes_version_snapshots() {
        let layout = test_layout("snapshots");
        let root = layout.root.parent().expect("root parent").to_path_buf();

        install_test_skill_at(&layout).expect("fixture should install");
        apply_at(
            &layout,
            TEST_SKILL_ID,
            "commit-v2".to_string(),
            vec![SkillFile {
                path: "SKILL.md".to_string(),
                contents:
                    "---\nname: skillsage-phase2-test\ndescription: Updated.\n---\n\n# Updated\n"
                        .to_string(),
            }],
        )
        .expect("fixture should update");

        let record = crate::core::repo::lockfile::load(&layout)
            .expect("lock should load")
            .skills
            .get(TEST_SKILL_ID)
            .cloned()
            .expect("fixture should be recorded");
        let snapshots = layout
            .snapshot_skill(&record.name)
            .expect("snapshot path should resolve");
        assert!(snapshots.is_dir());

        uninstall_skill_at(&layout, TEST_SKILL_ID).expect("fixture should uninstall");
        assert!(!snapshots.exists());
        assert!(!crate::core::repo::lockfile::load(&layout)
            .expect("lock should load after uninstall")
            .skills
            .contains_key(TEST_SKILL_ID));

        fs::remove_dir_all(root).expect("remove test root");
    }
}
