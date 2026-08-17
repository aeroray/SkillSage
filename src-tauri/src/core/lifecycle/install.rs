#[cfg(test)]
use std::path::PathBuf;

use serde::Serialize;

use crate::core::distribute::{link, tracker::LinkTracker};
use crate::core::repo::{atomic, layout::RepoLayout, lockfile};
use crate::core::skill::parser::read_skill_md;
use crate::core::tools::registry::find_tool;
use crate::error::SkillsageError;

pub const TEST_SKILL_ID: &str = "skillsage/skillsage-phase2-test";
const TEST_SKILL_OWNER: &str = "skillsage";
const TEST_SKILL_REPO: &str = "skillsage-phase2-test";
const TEST_SKILL_COMMIT: &str = "phase2-fixture";

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
    pub distributed_to: Vec<String>,
    pub central_path: String,
    pub link_paths: Vec<String>,
}

pub fn install_test_skill(agents: Vec<String>) -> Result<InstallResult, SkillsageError> {
    let layout = RepoLayout::from_user_home()?;
    install_test_skill_at(&layout, agents)
}

pub fn install_test_skill_at(
    layout: &RepoLayout,
    agents: Vec<String>,
) -> Result<InstallResult, SkillsageError> {
    let tools = validate_agents(&agents)?;
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
    let destination = layout.remote_skill(TEST_SKILL_OWNER, &parsed.manifest.name)?;
    if destination.exists() {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(SkillsageError::AlreadyInstalled(TEST_SKILL_ID.to_string()));
    }

    if let Err(error) = atomic::commit_dir(&temp_dir, &destination) {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(error);
    }

    let mut tracker = LinkTracker::default();
    for tool in tools {
        let target = tool.skills_path()?.join(&parsed.manifest.name);
        if let Err(error) = tracker.create(&destination, target) {
            tracker.rollback();
            let _ = atomic::remove_dir(&destination);
            return Err(error);
        }
    }

    let mut lock = match lockfile::load(layout) {
        Ok(value) => value,
        Err(error) => {
            tracker.rollback();
            let _ = atomic::remove_dir(&destination);
            return Err(error);
        }
    };
    if lock.skills.contains_key(TEST_SKILL_ID) {
        tracker.rollback();
        let _ = atomic::remove_dir(&destination);
        return Err(SkillsageError::AlreadyInstalled(TEST_SKILL_ID.to_string()));
    }

    let link_paths = tracker.into_paths();
    let record = lockfile::SkillLockRecord {
        id: TEST_SKILL_ID.to_string(),
        name: parsed.manifest.name.clone(),
        owner: TEST_SKILL_OWNER.to_string(),
        repo: TEST_SKILL_REPO.to_string(),
        skill_path: None,
        source: "builtin://phase2-fixture".to_string(),
        current_version: TEST_SKILL_COMMIT.to_string(),
        current_hash: current_hash.clone(),
        distributed_to: agents.clone(),
        installed_at: lockfile::unix_timestamp(),
        version_history: Vec::new(),
    };
    lock.skills.insert(TEST_SKILL_ID.to_string(), record);

    if let Err(error) = lockfile::save(layout, &lock) {
        for path in &link_paths {
            let _ = link::remove_link(path);
        }
        let _ = atomic::remove_dir(&destination);
        return Err(error);
    }

    Ok(InstallResult {
        id: TEST_SKILL_ID.to_string(),
        name: parsed.manifest.name,
        owner: TEST_SKILL_OWNER.to_string(),
        current_version: TEST_SKILL_COMMIT.to_string(),
        current_hash,
        distributed_to: agents,
        central_path: destination.display().to_string(),
        link_paths: link_paths
            .into_iter()
            .map(|path| path.display().to_string())
            .collect(),
    })
}

pub fn uninstall_skill(skill_id: &str) -> Result<(), SkillsageError> {
    let layout = RepoLayout::from_user_home()?;
    uninstall_skill_at(&layout, skill_id)
}

pub fn uninstall_skill_at(layout: &RepoLayout, skill_id: &str) -> Result<(), SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let record = lock
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;

    for agent in &record.distributed_to {
        let tool = find_tool(agent)?;
        let link_path = tool.skills_path()?.join(&record.name);
        link::remove_link(&link_path)?;
    }

    let destination = layout.remote_skill(&record.owner, &record.name)?;
    atomic::remove_dir(&destination)?;
    lock.skills.remove(skill_id);
    lockfile::save(layout, &lock)?;
    Ok(())
}

fn validate_agents(
    agents: &[String],
) -> Result<Vec<crate::core::tools::registry::ToolDefinition>, SkillsageError> {
    let mut tools = Vec::with_capacity(agents.len());
    for agent in agents {
        tools.push(find_tool(agent)?);
    }
    Ok(tools)
}

#[cfg(test)]
pub fn test_skill_path(layout: &RepoLayout) -> Result<PathBuf, SkillsageError> {
    layout.remote_skill(TEST_SKILL_OWNER, "skillsage-phase2-test")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{install_test_skill_at, test_skill_path, uninstall_skill_at, TEST_SKILL_ID};
    use crate::core::repo::layout::RepoLayout;

    #[test]
    fn installs_and_uninstalls_fixture_without_distribution() {
        let root = std::env::temp_dir().join(format!("skillsage-install-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let layout = RepoLayout::new(root.clone());

        let result = install_test_skill_at(&layout, Vec::new()).expect("fixture should install");
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
}
