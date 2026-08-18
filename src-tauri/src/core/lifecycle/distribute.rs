use crate::core::distribute::{link, tracker::LinkTracker};
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::tools::registry::find_tool;
use crate::error::SkillsageError;

pub fn adjust_at(
    layout: &RepoLayout,
    skill_id: &str,
    agents: Vec<String>,
) -> Result<lockfile::SkillLockRecord, SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let current = lock
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;
    for agent in &agents {
        find_tool(agent)?;
    }

    let old: std::collections::HashSet<_> = current.distributed_to.iter().cloned().collect();
    let next: std::collections::HashSet<_> = agents.iter().cloned().collect();
    let mut tracker = LinkTracker::default();
    for agent in next.difference(&old) {
        let tool = find_tool(agent)?;
        if let Err(error) = tracker.create(
            &layout.remote_skill(&current.owner, &current.name)?,
            tool.skills_path()?.join(&current.name),
        ) {
            tracker.rollback();
            return Err(error);
        }
    }
    for agent in old.difference(&next) {
        let tool = find_tool(agent)?;
        let path = tool.skills_path()?.join(&current.name);
        if let Err(error) = link::remove_link(&path) {
            tracker.rollback();
            return Err(error);
        }
    }

    let mut updated = current;
    updated.distributed_to = agents;
    lock.skills.insert(skill_id.to_string(), updated.clone());
    if let Err(error) = lockfile::save(layout, &lock) {
        tracker.rollback();
        return Err(error);
    }
    Ok(updated)
}
