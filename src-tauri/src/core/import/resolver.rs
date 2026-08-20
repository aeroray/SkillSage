use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::core::lifecycle::install::InstallResult;
use crate::core::paths;
use crate::core::repo::conflict::{self, ConflictAction};
use crate::core::repo::{atomic, layout::RepoLayout, lockfile};
use crate::core::skill::parser::{is_valid_skill_name, read_skill_md};
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

pub fn import_at(
    layout: &RepoLayout,
    path: &str,
    conflict: &str,
    rename_to: Option<String>,
    conflict_action: Option<ConflictAction>,
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
    let mut overwrite_id = None;

    // Axis one: does a lock record we already track own this name? Resolved
    // by the caller's explicit reject/overwrite/rename choice, same as
    // before this redesign.
    if let Some(record) = &existing {
        if !record.source.starts_with("local://") {
            return Err(SkillsageError::NameConflict(format!(
                "技能名已被远程技能 {} 占用",
                record.id
            )));
        }
        match conflict {
            "overwrite" => overwrite_id = Some(record.id.clone()),
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
        if let Err(error) = source::copy_regular_file(&file.source_path, &target) {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
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

    // Axis one's final name may have changed (rename branch) — re-check it
    // isn't already tracked under a different id than the one we're
    // overwriting.
    let mut lock = match lockfile::load(layout) {
        Ok(lock) => lock,
        Err(error) => {
            let _ = atomic::remove_dir(&temp_dir);
            return Err(error);
        }
    };
    if conflict::is_tracked(&lock, &parsed.manifest.name)
        && overwrite_id.as_deref() != existing.as_ref().map(|record| record.id.as_str())
    {
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
    // Axis two: an untracked foreign path already sitting at that flat slot.
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

    let current_hash = match lockfile::content_hash(&temp_dir) {
        Ok(value) => value,
        Err(error) => {
            let mut recovery = atomic::remove_dir(&temp_dir).err();
            if let Some(pending) = pending {
                if let Err(error) = pending.restore() {
                    if recovery.is_none() {
                        recovery = Some(error);
                    }
                }
            }
            return Err(with_recovery(error, recovery));
        }
    };
    let replacement = match atomic::replace_dir_transaction(&temp_dir, &destination) {
        Ok(replacement) => replacement,
        Err(error) => {
            let mut recovery = atomic::remove_dir(&temp_dir).err();
            if let Some(pending) = pending {
                if let Err(error) = pending.restore() {
                    if recovery.is_none() {
                        recovery = Some(error);
                    }
                }
            }
            return Err(with_recovery(error, recovery));
        }
    };

    if overwrite_id.is_some() {
        if let Some(existing_id) = overwrite_id.as_deref() {
            lock.skills.remove(existing_id);
        }
    }

    let id = format!("local/{}", parsed.manifest.name);
    lock.skills.insert(
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
            installed_at: lockfile::unix_timestamp(),
            version_history: Vec::new(),
            description: parsed.manifest.description.clone(),
        },
    );
    if let Err(error) = lockfile::save(layout, &lock) {
        let rollback = replacement.rollback();
        let takeover = pending.map(|pending| pending.restore());
        let recovery = first_error(rollback, takeover);
        return Err(with_recovery(error, recovery));
    }
    if let Err(error) = replacement.finalize() {
        tracing::warn!(error = %error, "无法清理本地导入的旧技能备份");
    }
    if let Some(pending) = pending {
        if let Err(error) = pending.finalize() {
            tracing::warn!(error = %error, "无法清理被接管的旧技能目录备份");
        }
    }

    Ok(InstallResult {
        id,
        name: parsed.manifest.name,
        owner: "local".into(),
        current_version: "local".into(),
        current_hash,
        install_path: paths::display(&destination),
    })
}

fn first_error(
    first: Result<(), SkillsageError>,
    second: Option<Result<(), SkillsageError>>,
) -> Option<SkillsageError> {
    first.err().or_else(|| second.and_then(Result::err))
}

fn with_recovery(primary: SkillsageError, recovery: Option<SkillsageError>) -> SkillsageError {
    match recovery {
        Some(recovery) => SkillsageError::Io(format!("{primary}; 恢复失败: {recovery}")),
        None => primary,
    }
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

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{import_at, preview_at};
    use crate::core::repo::{layout::RepoLayout, lockfile};

    #[test]
    fn previews_imports_and_supports_rename_conflicts() {
        let root = std::env::temp_dir().join(format!("skillsage-import-{}", std::process::id()));
        let source = root.join("source");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
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
            "reject",
            None,
            None,
        )
        .expect("import should succeed");
        let error = import_at(
            &layout,
            source.to_str().expect("source path"),
            "reject",
            None,
            None,
        )
        .expect_err("duplicate should require a strategy");
        assert!(error.to_string().contains("覆盖或重命名"));
        import_at(
            &layout,
            source.to_str().expect("source path"),
            "rename",
            Some("local-research-copy".into()),
            None,
        )
        .expect("rename should succeed");
        let lock = lockfile::load(&layout).expect("lock should load");
        assert!(lock.skills.contains_key("local/local-research"));
        assert!(lock.skills.contains_key("local/local-research-copy"));
        fs::remove_dir_all(root).expect("remove test root");
    }
}
