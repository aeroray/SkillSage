use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::core::repo::layout::RepoLayout;
use crate::core::skill::parser::read_skill_md;
use crate::core::tools::registry::TOOLS;
use crate::error::SkillsageError;

use super::classifier::find_legacy_remote;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source_path: String,
    pub location: String,
    pub kind: String,
    pub classification: String,
    pub tool_ids: Vec<String>,
    pub remote_owner: Option<String>,
    pub remote_repo: Option<String>,
    pub remote_source: Option<String>,
    pub remote_version: Option<String>,
    pub can_takeover: bool,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateScanResult {
    pub items: Vec<MigrateItem>,
    pub scanned_roots: Vec<String>,
}

#[derive(Debug, Clone)]
struct Candidate {
    path: PathBuf,
    location: String,
    tool_id: Option<String>,
}

pub fn scan(layout: &RepoLayout) -> Result<MigrateScanResult, SkillsageError> {
    let home = dirs::home_dir().ok_or(SkillsageError::HomeDirectoryUnavailable)?;
    let public_root = home.join(".agents/skills");
    let mut roots = Vec::new();
    let mut candidates = Vec::new();
    for tool in TOOLS {
        let root = tool.skills_path()?;
        roots.push(root.display().to_string());
        collect_root(&root, "tool", Some(tool.id), &mut candidates)?;
    }
    roots.push(public_root.display().to_string());
    collect_root(&public_root, "public", None, &mut candidates)?;
    build_result(layout, &home, &public_root, roots, candidates)
}

fn build_result(
    layout: &RepoLayout,
    home: &Path,
    public_root: &Path,
    roots: Vec<String>,
    candidates: Vec<Candidate>,
) -> Result<MigrateScanResult, SkillsageError> {
    let central_root = canonical_or_self(&layout.root);
    let public_root = canonical_or_self(public_root);
    let mut items: BTreeMap<String, MigrateItem> = BTreeMap::new();
    for candidate in candidates {
        let source_path = canonical_or_self(&candidate.path);
        if is_under(&source_path, &central_root) {
            continue;
        }
        let link_like = is_link_like(&candidate.path);
        let resolved_kind = if link_like {
            if is_under(&source_path, &public_root) {
                "public-link"
            } else {
                "unknown-link"
            }
        } else {
            "external-directory"
        };
        let skill_md = source_path.join("SKILL.md");
        let parsed = read_skill_md(&skill_md);
        let (name, description) = match parsed {
            Ok(parsed) => (parsed.manifest.name, parsed.manifest.description),
            Err(_error) => {
                if link_like {
                    (
                        candidate
                            .path
                            .file_name()
                            .and_then(|value| value.to_str())
                            .unwrap_or("unknown")
                            .to_string(),
                        String::new(),
                    )
                } else {
                    continue;
                }
            }
        };
        let legacy = find_legacy_remote(home, &name);
        let classification = if resolved_kind == "unknown-link" {
            "unknown"
        } else if legacy.is_some() {
            "remote"
        } else {
            "local"
        };
        let key = source_path.to_string_lossy().to_string();
        let item = items.entry(key.clone()).or_insert_with(|| MigrateItem {
            id: key.clone(),
            name: name.clone(),
            description: description.clone(),
            source_path: key.clone(),
            location: candidate.location.clone(),
            kind: resolved_kind.to_string(),
            classification: classification.to_string(),
            tool_ids: Vec::new(),
            remote_owner: legacy.as_ref().map(|source| source.owner.clone()),
            remote_repo: legacy.as_ref().map(|source| source.repo.clone()),
            remote_source: legacy.as_ref().map(|source| source.source.clone()),
            remote_version: legacy.as_ref().map(|source| source.version.clone()),
            can_takeover: resolved_kind != "unknown-link" && !description.is_empty(),
            warning: if resolved_kind == "unknown-link" {
                Some("未知来源链接不会自动接管，可手动处理。".into())
            } else if classification == "remote" {
                Some("接管后将由 SkillSage 管理此技能。".into())
            } else {
                None
            },
        });
        if let Some(tool_id) = candidate.tool_id {
            if !item.tool_ids.iter().any(|id| id == &tool_id) {
                item.tool_ids.push(tool_id);
            }
        }
    }
    Ok(MigrateScanResult {
        items: items.into_values().collect(),
        scanned_roots: roots,
    })
}

fn collect_root(
    root: &Path,
    location: &str,
    tool_id: Option<&str>,
    candidates: &mut Vec<Candidate>,
) -> Result<(), SkillsageError> {
    if !root.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(root)? {
        let path = entry?.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.is_dir() || metadata.file_type().is_symlink() {
            candidates.push(Candidate {
                path,
                location: location.to_string(),
                tool_id: tool_id.map(str::to_string),
            });
        }
    }
    Ok(())
}

fn is_link_like(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
        || std::fs::read_link(path).is_ok()
}

fn canonical_or_self(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn normalize(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn is_under(path: &Path, root: &Path) -> bool {
    let path = normalize(path);
    let root = normalize(root);
    path == root || path.starts_with(&format!("{root}/"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{build_result, Candidate};
    use crate::core::repo::layout::RepoLayout;

    #[test]
    fn classifies_external_skill_directories_and_skips_central_links() {
        let root =
            std::env::temp_dir().join(format!("skillsage-migrate-scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let external = root.join("external");
        let central = root.join("repo");
        fs::create_dir_all(&external).expect("create external");
        fs::create_dir_all(&central).expect("create central");
        fs::write(
            external.join("SKILL.md"),
            "---\nname: old-skill\ndescription: Old skill.\n---\n",
        )
        .expect("write manifest");
        let layout = RepoLayout::new(central.clone());
        let result = build_result(
            &layout,
            &root,
            &root.join("public"),
            vec![],
            vec![Candidate {
                path: external,
                location: "public".into(),
                tool_id: None,
            }],
        )
        .expect("scan should succeed");
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].classification, "local");
        fs::remove_dir_all(root).expect("remove test root");
    }
}
