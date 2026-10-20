use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::core::paths;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::skill::parser::is_valid_skill_name;
use crate::error::SkillsageError;

use super::export::{validate_settings, SyncPackage, SyncSettings, SyncSkillEntry, FORMAT_VERSION};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSkillPreview {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: String,
    pub current_version: String,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncImportPreview {
    pub path: String,
    pub exported_at: String,
    pub settings: Option<SyncSettings>,
    pub translated_descriptions_count: usize,
    pub skills: Vec<SyncSkillPreview>,
}

pub fn load(path: &str) -> Result<SyncPackage, SkillsageError> {
    let path = Path::new(path);
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| SkillsageError::SyncInvalid(format!("无法读取同步数据文件: {error}")))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(SkillsageError::SyncInvalid(format!(
            "同步数据文件不存在: {}",
            path.display()
        )));
    }
    if metadata.len() > crate::core::limits::MAX_SYNC_PACKAGE_BYTES {
        return Err(SkillsageError::SyncInvalid(
            "同步数据文件超过 8 MiB，已拒绝读取".into(),
        ));
    }
    let content = std::fs::read_to_string(path)
        .map_err(|error| SkillsageError::SyncInvalid(error.to_string()))?;
    let package: SyncPackage = serde_json::from_str(&content)
        .map_err(|error| SkillsageError::SyncInvalid(error.to_string()))?;
    validate(&package)?;
    Ok(package)
}

pub fn preview_at(layout: &RepoLayout, path: &str) -> Result<SyncImportPreview, SkillsageError> {
    let package = load(path)?;
    let lock = lockfile::load(layout)?;
    let skills = package
        .skills
        .iter()
        .map(|entry| SyncSkillPreview {
            id: entry.id.clone(),
            name: entry.name.clone(),
            description: entry.description.clone(),
            source: entry.source.clone(),
            current_version: entry.current_version.clone(),
            installed: lock.skills.contains_key(&entry.id)
                || lock.skills.values().any(|record| record.name == entry.name),
        })
        .collect();
    Ok(SyncImportPreview {
        path: paths::display(&PathBuf::from(path)),
        exported_at: package.exported_at,
        settings: package.settings,
        translated_descriptions_count: package.translated_descriptions.len(),
        skills,
    })
}

/// The package entries the user selected, in selection order and deduplicated.
///
/// An empty selection means nothing is imported. It does *not* mean "everything":
/// the dialog keeps the selection in state and sends the full id list when the
/// user means all, and its checkbox grid can legitimately be cleared while the
/// user only wants the package's settings — treating that as "all" installed the
/// entire package.
pub fn selected_entries(
    package: &SyncPackage,
    selected_ids: &[String],
) -> Result<Vec<SyncSkillEntry>, SkillsageError> {
    let mut entries = Vec::new();
    let mut seen = HashSet::new();
    for id in selected_ids {
        if !seen.insert(id.clone()) {
            continue;
        }
        let entry = package
            .skills
            .iter()
            .find(|entry| &entry.id == id)
            .cloned()
            .ok_or_else(|| SkillsageError::SyncInvalid(format!("同步数据中不存在技能: {id}")))?;
        entries.push(entry);
    }
    Ok(entries)
}

fn validate(package: &SyncPackage) -> Result<(), SkillsageError> {
    if package.format_version != 1 && package.format_version != FORMAT_VERSION {
        return Err(SkillsageError::SyncInvalid(format!(
            "不支持的同步数据版本: {}",
            package.format_version
        )));
    }
    if let Some(settings) = &package.settings {
        validate_settings(settings)?;
    }
    crate::core::settings::validate_translations(&package.translated_descriptions)
        .map_err(|error| SkillsageError::SyncInvalid(error.to_string()))?;
    if package.skills.len() > crate::core::limits::MAX_SYNC_SKILLS {
        return Err(SkillsageError::SyncInvalid(
            "同步数据中的技能数量过多".into(),
        ));
    }
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    for entry in &package.skills {
        if entry.id.is_empty()
            || entry.id.len() > 512
            || !entry
                .id
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "/_-".contains(character))
            || !is_valid_skill_name(&entry.name)
            || !ids.insert(entry.id.clone())
            || !names.insert(entry.name.clone())
            || entry.owner.is_empty()
            || !is_safe_component(&entry.owner)
            || entry.repo.is_empty()
            || !is_safe_component(&entry.repo)
            || entry.current_version.is_empty()
            || !is_safe_reference(&entry.current_version)
            || entry.current_hash.is_empty()
            || !is_allowed_source(&entry.source)
            || !has_consistent_identity(entry)
        {
            return Err(SkillsageError::SyncInvalid(format!(
                "技能条目无效: {}",
                entry.id
            )));
        }
        if let Some(skill_path) = &entry.skill_path {
            validate_skill_path(skill_path)?;
        }
    }
    Ok(())
}

fn has_consistent_identity(entry: &SyncSkillEntry) -> bool {
    let id_has_owner_and_name = entry.id.starts_with(&format!("{}/", entry.owner))
        && entry.id.ends_with(&format!("/{}", entry.name));
    if !id_has_owner_and_name {
        return false;
    }
    let Ok(source) = url::Url::parse(&entry.source) else {
        return false;
    };
    let segments = source
        .path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    segments
        .windows(2)
        .any(|pair| pair == [entry.owner.as_str(), entry.repo.as_str()])
}

fn is_safe_component(value: &str) -> bool {
    value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
}

fn is_safe_reference(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && !value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '/')
        })
}

fn is_allowed_source(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.username().is_empty()
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && matches!(
            url.host_str(),
            Some("skills.sh")
                | Some("www.skills.sh")
                | Some("github.com")
                | Some("www.github.com")
                | Some("raw.githubusercontent.com")
        )
}

fn validate_skill_path(value: &str) -> Result<(), SkillsageError> {
    if value.is_empty()
        || value.contains('\\')
        || value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(SkillsageError::SyncInvalid(format!(
            "技能路径无效: {value}"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{selected_entries, SyncPackage, SyncSkillEntry, FORMAT_VERSION};
    use crate::error::SkillsageError;

    fn entry(id: &str) -> SyncSkillEntry {
        let (owner, name) = id.split_once('/').expect("id has an owner and a name");
        SyncSkillEntry {
            id: id.to_string(),
            name: name.to_string(),
            owner: owner.to_string(),
            repo: "skills".into(),
            skill_path: None,
            source: format!("https://github.com/{owner}/skills/tree/main/{name}"),
            current_version: "abc123".into(),
            current_hash: "hash".into(),
            description: String::new(),
        }
    }

    fn package() -> SyncPackage {
        SyncPackage {
            format_version: FORMAT_VERSION,
            exported_at: "1".into(),
            settings: None,
            translated_descriptions: Default::default(),
            skills: vec![entry("acme/alpha"), entry("acme/beta"), entry("acme/gamma")],
        }
    }

    #[test]
    fn an_empty_selection_selects_no_entries() {
        // The dialog can submit with every checkbox cleared while importing
        // only the package's settings; that must not install the whole package.
        let selected = selected_entries(&package(), &[]).expect("empty selection is valid");
        assert!(selected.is_empty());
    }

    #[test]
    fn a_subset_selects_exactly_those_entries_in_selection_order() {
        let selected = selected_entries(
            &package(),
            &["acme/gamma".into(), "acme/alpha".into()],
        )
        .expect("subset should resolve");
        let ids: Vec<&str> = selected.iter().map(|entry| entry.id.as_str()).collect();
        assert_eq!(ids, vec!["acme/gamma", "acme/alpha"]);
    }

    #[test]
    fn duplicate_ids_are_deduplicated() {
        let selected = selected_entries(
            &package(),
            &["acme/alpha".into(), "acme/alpha".into(), "acme/beta".into()],
        )
        .expect("duplicates should resolve");
        let ids: Vec<&str> = selected.iter().map(|entry| entry.id.as_str()).collect();
        assert_eq!(ids, vec!["acme/alpha", "acme/beta"]);
    }

    #[test]
    fn an_unknown_id_is_a_sync_invalid_error() {
        let result = selected_entries(&package(), &["acme/does-not-exist".into()]);
        assert!(matches!(result, Err(SkillsageError::SyncInvalid(_))));
    }
}
