use std::collections::BTreeMap;

use crate::core::distribute::{conflict, link, tracker::LinkTracker};
use crate::core::lifecycle::install::destination_for_record;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::tools::registry::find_tool;
use crate::error::SkillsageError;

pub fn adjust_at_with_conflicts(
    layout: &RepoLayout,
    skill_id: &str,
    agents: Vec<String>,
    actions: &BTreeMap<String, String>,
) -> Result<lockfile::SkillLockRecord, SkillsageError> {
    let mut lock = lockfile::load(layout)?;
    let mut current = lock
        .skills
        .get(skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;
    for agent in &agents {
        find_tool(agent)?;
    }

    let mut next_agents = agents;
    for conflict_item in conflict::find_for_skill(layout, &current.name, &next_agents)? {
        match actions.get(&conflict_item.tool_id).map(String::as_str) {
            Some("skip") => next_agents.retain(|agent| agent != &conflict_item.tool_id),
            Some("takeover") => {
                conflict::takeover_at(layout, &conflict_item, &current.name)?;
                lock = lockfile::load(layout)?;
                current = lock
                    .skills
                    .get(skill_id)
                    .cloned()
                    .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;
            }
            _ => {
                return Err(SkillsageError::DistributionConflict(format!(
                    "{} 的目标路径已存在: {}",
                    conflict_item.tool_name, conflict_item.path
                )))
            }
        }
    }
    let old: std::collections::HashSet<_> = current.distributed_to.iter().cloned().collect();
    let next: std::collections::HashSet<_> = next_agents.iter().cloned().collect();
    let mut tracker = LinkTracker::default();
    for agent in next.difference(&old) {
        let tool = find_tool(agent)?;
        if let Err(error) = tracker.create(
            &destination_for_record(layout, &current)?,
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
    updated.distributed_to = next_agents;
    lock.skills.insert(skill_id.to_string(), updated.clone());
    if let Err(error) = lockfile::save(layout, &lock) {
        tracker.rollback();
        return Err(error);
    }
    Ok(updated)
}
