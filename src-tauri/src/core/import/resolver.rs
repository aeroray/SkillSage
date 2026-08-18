use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::core::distribute::{conflict as distribution_conflict, link, tracker::LinkTracker};
use crate::core::lifecycle::install::{uninstall_skill_at, InstallResult};
use crate::core::paths;
use crate::core::repo::{atomic, layout::RepoLayout, lockfile};
use crate::core::skill::parser::{is_valid_skill_name, read_skill_md};
use crate::core::tools::registry::find_tool;
use crate::error::SkillsageError;

use super::source;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub source_path: String,
    pub source_kind: String,
    pub skill_root: String,
    pub name: String,
    pub description: String,
    pub file_count: usize,
    pub existing_local: bool,
    pub existing_skill_id: Option<String>,
    pub remote_conflict: bool,
}

pub fn preview_at(layout: &RepoLayout, path: &str) -> Result<ImportPreview, SkillsageError> {
    let source_path = PathBuf::from(path);
    let resolved = source::resolve(&source_path)?;
    let parsed = read_skill_md(&resolved.skill_md)?;
    let files = source::collect_resolved_files(&resolved)?;
    let lock = lockfile::load(layout)?;
    let existing = lock
        .skills
        .values()
        .find(|record| record.name == parsed.manifest.name);
    Ok(ImportPreview {
        source_path: paths::display(&source_path),
        source_kind: resolved.kind.to_string(),
        skill_root: paths::display(&resolved.root),
        name: parsed.manifest.name,
        description: parsed.manifest.description,
        file_count: files.len(),
        existing_local: existing.is_some_and(|record| record.source.starts_with("local://")),
        existing_skill_id: existing.map(|record| record.id.clone()),
        remote_conflict: existing.is_some_and(|record| !record.source.starts_with("local://")),
    })
}

#[allow(dead_code)]
pub fn import_at(
    layout: &RepoLayout,
    path: &str,
    agents: Vec<String>,
    conflict: &str,
    rename_to: Option<String>,
) -> Result<InstallResult, SkillsageError> {
    import_at_with_conflicts(layout, path, agents, conflict, rename_to, &BTreeMap::new())
}

pub fn import_at_with_conflicts(
    layout: &RepoLayout,
    path: &str,
    agents: Vec<String>,
    conflict: &str,
    rename_to: Option<String>,
    actions: &BTreeMap<String, String>,
) -> Result<InstallResult, SkillsageError> {
    let source_path = PathBuf::from(path);
    let resolved = source::resolve(&source_path)?;
    let mut parsed = read_skill_md(&resolved.skill_md)?;
    let mut target_name = parsed.manifest.name.clone();
    let lock = lockfile::load(layout)?;
    let existing = lock
        .skills
        .values()
        .find(|record| record.name == target_name)
        .cloned();

    if let Some(record) = &existing {
        if !record.source.starts_with("local://") {
            return Err(SkillsageError::NameConflict(format!(
                "技能名已被远程技能 {} 占用",
                record.id
            )));
        }
        match conflict {
            "overwrite" => uninstall_skill_at(layout, &record.id)?,
            "rename" => {
                target_name = validate_rename(rename_to)?;
            }
            _ => {
                return Err(SkillsageError::NameConflict(format!(
                    "本地技能 {} 已存在，请选择覆盖或重命名",
                    record.name
                )))
            }
        }
    } else if conflict == "rename" {
        target_name = validate_rename(rename_to)?;
    }

    validate_agents(&agents)?;
    layout.ensure_roots()?;
    let temp_dir = atomic::create_temp_dir(layout)?;
    let files = match source::collect_resolved_files(&resolved) {
        Ok(files) => files,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };
    for file in &files {
        let target = temp_dir.join(&file.relative_path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if let Err(error) = std::fs::copy(&file.source_path, &target) {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error.into());
        }
    }

    if target_name != parsed.manifest.name {
        if let Err(error) = rewrite_skill_name(&temp_dir.join("SKILL.md"), &target_name) {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
        parsed = match read_skill_md(&temp_dir.join("SKILL.md")) {
            Ok(parsed) => parsed,
            Err(error) => {
                let _ = atomic::remove_dir(&temp_dir);
                return Err(error);
            }
        };
    }
    let destination = layout.local_skill(&parsed.manifest.name)?;
    if destination.exists() {
        let _ = atomic::remove_dir(&temp_dir);
        return Err(SkillsageError::NameConflict(format!(
            "本地目标路径已存在: {}",
            destination.display()
        )));
    }
    let current_hash = lockfile::content_hash(&temp_dir)?;
    atomic::commit_dir(&temp_dir, &destination)?;

    let mut actual_agents = agents.clone();
    let mut takeovers = Vec::new();
    for conflict_item in
        distribution_conflict::find_for_skill(layout, &parsed.manifest.name, &actual_agents)?
    {
        match actions.get(&conflict_item.tool_id).map(String::as_str) {
            Some("skip") => actual_agents.retain(|agent| agent != &conflict_item.tool_id),
            Some("takeover") => {
                match distribution_conflict::takeover_at_transaction(
                    layout,
                    &conflict_item,
                    &parsed.manifest.name,
                ) {
                    Ok(transaction) => takeovers.push(transaction),
                    Err(error) => {
                        let _ = atomic::remove_dir(&destination);
                        distribution_conflict::rollback_takeovers(layout, takeovers);
                        return Err(error);
                    }
                }
            }
            _ => {
                let _ = atomic::remove_dir(&destination);
                distribution_conflict::rollback_takeovers(layout, takeovers);
                return Err(SkillsageError::DistributionConflict(format!(
                    "{} 的目标路径已存在: {}",
                    conflict_item.tool_name, conflict_item.path
                )));
            }
        }
    }
    let tools = match validate_agents(&actual_agents) {
        Ok(tools) => tools,
        Err(error) => {
            let _ = atomic::remove_dir(&destination);
            distribution_conflict::rollback_takeovers(layout, takeovers);
            return Err(error);
        }
    };
    let mut tracker = LinkTracker::default();
    for tool in tools {
        if let Err(error) = tracker.create(
            &destination,
            tool.skills_path()?.join(&parsed.manifest.name),
        ) {
            tracker.rollback();
            let _ = atomic::remove_dir(&destination);
            distribution_conflict::rollback_takeovers(layout, takeovers);
            return Err(error);
        }
    }

    let mut next_lock = match lockfile::load(layout) {
        Ok(lock) => lock,
        Err(error) => {
            tracker.rollback();
            let _ = atomic::remove_dir(&destination);
            distribution_conflict::rollback_takeovers(layout, takeovers);
            return Err(error);
        }
    };
    let id = format!("local/{}", parsed.manifest.name);
    if next_lock
        .skills
        .values()
        .any(|record| record.name == parsed.manifest.name)
    {
        tracker.rollback();
        let _ = atomic::remove_dir(&destination);
        distribution_conflict::rollback_takeovers(layout, takeovers);
        return Err(SkillsageError::NameConflict(parsed.manifest.name));
    }
    let link_paths = tracker.into_paths();
    next_lock.skills.insert(
        id.clone(),
        lockfile::SkillLockRecord {
            id: id.clone(),
            name: parsed.manifest.name.clone(),
            owner: "local".into(),
            repo: "local".into(),
            skill_path: None,
            source: format!("local://{}", parsed.manifest.name),
            current_version: "local".into(),
            current_hash: current_hash.clone(),
            distributed_to: actual_agents.clone(),
            installed_at: lockfile::unix_timestamp(),
            version_history: Vec::new(),
            description: parsed.manifest.description.clone(),
        },
    );
    if let Err(error) = lockfile::save(layout, &next_lock) {
        for path in &link_paths {
            let _ = link::remove_link(path);
        }
        let _ = atomic::remove_dir(&destination);
        distribution_conflict::rollback_takeovers(layout, takeovers);
        return Err(error);
    }

    Ok(InstallResult {
        id,
        name: parsed.manifest.name,
        owner: "local".into(),
        current_version: "local".into(),
        current_hash,
        distributed_to: actual_agents,
        central_path: paths::display(&destination),
        link_paths: link_paths
            .into_iter()
            .map(|path| paths::display(&path))
            .collect(),
    })
}

fn validate_rename(rename_to: Option<String>) -> Result<String, SkillsageError> {
    let name = rename_to
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| SkillsageError::NameConflict("重命名需要填写新的技能名".into()))?;
    if !is_valid_skill_name(&name) {
        return Err(SkillsageError::InvalidSkill(
            "新的技能名必须是 kebab-case（例如 web-research）".into(),
        ));
    }
    Ok(name)
}

fn rewrite_skill_name(path: &Path, name: &str) -> Result<(), SkillsageError> {
    let content = std::fs::read_to_string(path)?;
    let mut in_frontmatter = false;
    let mut found = false;
    let mut lines = Vec::new();
    for line in content.lines() {
        if line == "---" {
            in_frontmatter = !in_frontmatter;
            lines.push(line.to_string());
            continue;
        }
        if in_frontmatter && line.starts_with("name:") {
            lines.push(format!("name: {name}"));
            found = true;
        } else {
            lines.push(line.to_string());
        }
    }
    if !found {
        return Err(SkillsageError::InvalidSkill(
            "SKILL.md frontmatter 缺少 name 字段".into(),
        ));
    }
    std::fs::write(path, format!("{}\n", lines.join("\n")))?;
    Ok(())
}

fn validate_agents(
    agents: &[String],
) -> Result<Vec<crate::core::tools::registry::ToolDefinition>, SkillsageError> {
    agents.iter().map(|agent| find_tool(agent)).collect()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{import_at, preview_at};
    use crate::core::repo::{layout::RepoLayout, lockfile};

    #[test]
    fn previews_imports_and_supports_rename_conflicts() {
        let root = std::env::temp_dir().join(format!("skillsage-import-{}", std::process::id()));
        let source = root.join("source");
        let layout = RepoLayout::new(root.join("repo"));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(source.join("references")).expect("create source");
        fs::write(
            source.join("SKILL.md"),
            "---\nname: local-research\ndescription: Local research.\n---\n\n# Local\n",
        )
        .expect("write skill");
        fs::write(source.join("references/readme.txt"), "reference").expect("write reference");

        let preview = preview_at(&layout, source.to_str().expect("source path"))
            .expect("preview should succeed");
        assert_eq!(preview.name, "local-research");
        assert_eq!(preview.file_count, 2);
        import_at(
            &layout,
            source.to_str().expect("source path"),
            Vec::new(),
            "reject",
            None,
        )
        .expect("import should succeed");
        let error = import_at(
            &layout,
            source.to_str().expect("source path"),
            Vec::new(),
            "reject",
            None,
        )
        .expect_err("duplicate should require a strategy");
        assert!(error.to_string().contains("覆盖或重命名"));
        import_at(
            &layout,
            source.to_str().expect("source path"),
            Vec::new(),
            "rename",
            Some("local-research-copy".into()),
        )
        .expect("rename should succeed");
        let lock = lockfile::load(&layout).expect("lock should load");
        assert!(lock.skills.contains_key("local/local-research"));
        assert!(lock.skills.contains_key("local/local-research-copy"));
        fs::remove_dir_all(root).expect("remove test root");
    }
}
