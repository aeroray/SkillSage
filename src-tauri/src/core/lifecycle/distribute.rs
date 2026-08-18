use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

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
    let mut takeovers = Vec::new();
    for conflict_item in conflict::find_for_skill(layout, &current.name, &next_agents)? {
        match actions.get(&conflict_item.tool_id).map(String::as_str) {
            Some("skip") => next_agents.retain(|agent| agent != &conflict_item.tool_id),
            Some("takeover") => {
                match conflict::takeover_at_transaction(layout, &conflict_item, &current.name) {
                    Ok(transaction) => takeovers.push(transaction),
                    Err(error) => {
                        conflict::rollback_takeovers(layout, takeovers);
                        return Err(error);
                    }
                }
                lock = match lockfile::load(layout) {
                    Ok(value) => value,
                    Err(error) => {
                        conflict::rollback_takeovers(layout, takeovers);
                        return Err(error);
                    }
                };
                current = lock
                    .skills
                    .get(skill_id)
                    .cloned()
                    .ok_or_else(|| SkillsageError::NotInstalled(skill_id.to_string()))?;
            }
            _ => {
                conflict::rollback_takeovers(layout, takeovers);
                return Err(SkillsageError::DistributionConflict(format!(
                    "{} 的目标路径已存在: {}",
                    conflict_item.tool_name, conflict_item.path
                )));
            }
        }
    }
    let old: std::collections::HashSet<_> = current.distributed_to.iter().cloned().collect();
    let next: std::collections::HashSet<_> = next_agents.iter().cloned().collect();
    let destination = match destination_for_record(layout, &current) {
        Ok(path) => path,
        Err(error) => {
            conflict::rollback_takeovers(layout, takeovers);
            return Err(error);
        }
    };
    let mut tracker = LinkTracker::default();
    for agent in next.difference(&old) {
        let tool = match find_tool(agent) {
            Ok(tool) => tool,
            Err(error) => {
                conflict::rollback_takeovers(layout, takeovers);
                return Err(error);
            }
        };
        let target = match tool.skills_path() {
            Ok(path) => path.join(&current.name),
            Err(error) => {
                tracker.rollback();
                conflict::rollback_takeovers(layout, takeovers);
                return Err(error);
            }
        };
        if let Err(error) = tracker.create(&destination, target) {
            tracker.rollback();
            conflict::rollback_takeovers(layout, takeovers);
            return Err(error);
        }
    }
    let mut removed = Vec::new();
    for agent in old.difference(&next) {
        let tool = match find_tool(agent) {
            Ok(tool) => tool,
            Err(error) => {
                tracker.rollback();
                restore_removed_links(&destination, &removed);
                conflict::rollback_takeovers(layout, takeovers);
                return Err(error);
            }
        };
        let path = match tool.skills_path() {
            Ok(path) => path.join(&current.name),
            Err(error) => {
                tracker.rollback();
                restore_removed_links(&destination, &removed);
                conflict::rollback_takeovers(layout, takeovers);
                return Err(error);
            }
        };
        if let Err(error) = link::remove_link(&path) {
            tracker.rollback();
            restore_removed_links(&destination, &removed);
            conflict::rollback_takeovers(layout, takeovers);
            return Err(error);
        }
        removed.push(path);
    }

    let mut updated = current;
    updated.distributed_to = next_agents;
    lock.skills.insert(skill_id.to_string(), updated.clone());
    if let Err(error) = lockfile::save(layout, &lock) {
        tracker.rollback();
        restore_removed_links(&destination, &removed);
        conflict::rollback_takeovers(layout, takeovers);
        return Err(error);
    }
    Ok(updated)
}

fn restore_removed_links(source: &Path, removed: &[PathBuf]) {
    for target in removed.iter().rev() {
        let _ = link::create_link(source, target);
    }
}
