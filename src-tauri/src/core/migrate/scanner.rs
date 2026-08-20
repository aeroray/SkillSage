use serde::Serialize;

use crate::core::import::source::validate_tree;
use crate::core::paths;
use crate::core::repo::atomic;
use crate::core::repo::conflict;
use crate::core::repo::layout::RepoLayout;
use crate::core::repo::lockfile;
use crate::core::skill::parser::read_skill_md;
use crate::error::SkillsageError;

/// A folder already sitting in the shared public directory that SkillSage
/// doesn't yet track — either placed there by another tool/process, or
/// left over from before this machine used SkillSage at all. A valid
/// SKILL.md name is authoritative; a mismatch must be resolved before adoption.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptableItem {
    pub name: String,
    pub declared_name: Option<String>,
    pub description: String,
    pub path: String,
    pub valid: bool,
    /// Only invalid entries with a safe, real directory and no valid SKILL.md
    /// may be removed from the shared directory by the user.
    pub removable: bool,
    /// Pre-checked in a bulk "adopt selected" action. False whenever the item
    /// isn't valid, or is valid but has something worth the user's specific
    /// attention (e.g. a name mismatch) before adopting it unattended.
    pub recommended: bool,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptScanResult {
    pub items: Vec<AdoptableItem>,
    pub scanned_root: String,
}

pub fn scan(layout: &RepoLayout) -> Result<AdoptScanResult, SkillsageError> {
    let scanned_root = paths::display(&layout.public_root);
    if !layout.public_root.is_dir() {
        return Ok(AdoptScanResult {
            items: Vec::new(),
            scanned_root,
        });
    }
    let lock = lockfile::load(layout)?;
    let mut items = Vec::new();
    for entry in std::fs::read_dir(&layout.public_root)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            // A link, or a stray file, sitting in the public root belongs to
            // some other tool/process. Adoption only concerns real
            // directories we might come to track.
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let name = name.to_string();
        if conflict::is_tracked(&lock, &name) {
            continue;
        }

        let display_path = paths::display(&path);
        // An embedded symlink would fail later anyway (content_hash/adopt_item
        // reject them the same way import and snapshotting already do), so
        // catch it at scan time and surface it as a clear warning instead of
        // a failure the user only sees after selecting "adopt".
        let item = if let Err(error) = validate_tree(&path) {
            AdoptableItem {
                name,
                declared_name: None,
                description: String::new(),
                path: display_path,
                valid: false,
                removable: false,
                recommended: false,
                warning: Some(error.to_string()),
            }
        } else {
            match read_skill_md(&path.join("SKILL.md")) {
                Ok(parsed) => {
                    let declared_name =
                        (parsed.manifest.name != name).then_some(parsed.manifest.name);
                    let warning = declared_name.as_ref().map(|declared| {
                        format!("SKILL.md 中的名称为 {declared}，建议按该名称整理后再采纳。")
                    });
                    AdoptableItem {
                        recommended: declared_name.is_none(),
                        name,
                        declared_name,
                        description: parsed.manifest.description,
                        path: display_path,
                        valid: true,
                        removable: false,
                        warning,
                    }
                }
                Err(_) => AdoptableItem {
                    name,
                    declared_name: None,
                    description: String::new(),
                    path: display_path,
                    valid: false,
                    removable: true,
                    recommended: false,
                    warning: Some("未找到有效的 SKILL.md，无法采纳。".into()),
                },
            }
        };
        items.push(item);
    }
    items.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(AdoptScanResult {
        items,
        scanned_root,
    })
}

pub fn remove_invalid(layout: &RepoLayout, name: &str) -> Result<(), SkillsageError> {
    layout.ensure_roots()?;
    let path = layout.skill(name)?;
    let item = scan(layout)?
        .items
        .into_iter()
        .find(|item| item.name == name)
        .ok_or_else(|| SkillsageError::PathNotFound(path.clone()))?;
    if item.valid || !item.removable {
        return Err(SkillsageError::InvalidSkill(
            "只能删除没有有效 SKILL.md 的安全目录".into(),
        ));
    }
    // Revalidate immediately before deletion. This keeps the destructive
    // action limited to a real directory whose tree contains no symlinks.
    validate_tree(&path)?;
    if read_skill_md(&path.join("SKILL.md")).is_ok() {
        return Err(SkillsageError::InvalidSkill(
            "条目已变化，请重新扫描后再处理".into(),
        ));
    }
    atomic::remove_dir(&path)
}

pub fn rename_mismatch(layout: &RepoLayout, name: &str) -> Result<String, SkillsageError> {
    layout.ensure_roots()?;
    let item = scan(layout)?
        .items
        .into_iter()
        .find(|item| item.name == name)
        .ok_or_else(|| SkillsageError::InvalidSkill("找不到需要整理的技能条目".into()))?;
    let declared_name = item
        .declared_name
        .ok_or_else(|| SkillsageError::InvalidSkill("该技能没有需要整理的 SKILL.md 名称".into()))?;
    let source = layout.skill(name)?;
    let destination = layout.skill(&declared_name)?;
    if std::fs::symlink_metadata(&destination).is_ok() {
        return Err(SkillsageError::NameConflict(declared_name));
    }
    let lock = lockfile::load(layout)?;
    if conflict::is_tracked(&lock, &declared_name) {
        return Err(SkillsageError::NameConflict(declared_name));
    }
    validate_tree(&source)?;
    let parsed = read_skill_md(&source.join("SKILL.md"))?;
    if parsed.manifest.name != declared_name {
        return Err(SkillsageError::InvalidSkill(
            "SKILL.md 名称已变化，请重新扫描后再处理".into(),
        ));
    }
    std::fs::rename(source, &destination)?;
    Ok(declared_name)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{remove_invalid, rename_mismatch, scan};
    use crate::core::repo::layout::RepoLayout;

    fn test_layout(name: &str) -> RepoLayout {
        let root = std::env::temp_dir().join(format!(
            "skillsage-adopt-scan-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        RepoLayout::new(root.join("central"), root.join("public"))
    }

    #[test]
    fn finds_untracked_valid_and_invalid_entries() {
        let layout = test_layout("basic");
        layout.ensure_roots().expect("create layout");
        let valid = layout.public_root.join("good-skill");
        fs::create_dir_all(&valid).expect("create valid dir");
        fs::write(
            valid.join("SKILL.md"),
            "---\nname: good-skill\ndescription: A good skill.\n---\n",
        )
        .expect("write manifest");
        let invalid = layout.public_root.join("not-a-skill");
        fs::create_dir_all(&invalid).expect("create invalid dir");

        let result = scan(&layout).expect("scan should succeed");
        assert_eq!(result.items.len(), 2);
        let good = result
            .items
            .iter()
            .find(|item| item.name == "good-skill")
            .expect("valid item present");
        assert!(good.valid);
        assert!(good.recommended);
        let bad = result
            .items
            .iter()
            .find(|item| item.name == "not-a-skill")
            .expect("invalid item present");
        assert!(!bad.valid);
        assert!(!bad.recommended);

        fs::remove_dir_all(&layout.root).expect("remove central root");
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }

    #[test]
    fn skips_entries_that_are_links() {
        let layout = test_layout("links");
        layout.ensure_roots().expect("create layout");
        let real_target = layout.root.parent().expect("root parent").join("elsewhere");
        fs::create_dir_all(&real_target).expect("create link target");
        let link_path = layout.public_root.join("linked-skill");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_target, &link_path).expect("create symlink");
        #[cfg(windows)]
        {
            // Directory junctions are exercised in core::distribute-equivalent
            // tests elsewhere; a plain file stand-in is enough here to prove
            // scan() skips non-directory entries too.
            fs::write(&link_path, "not a directory").expect("create file stand-in");
        }

        let result = scan(&layout).expect("scan should succeed");
        assert!(result.items.is_empty());

        fs::remove_dir_all(&layout.root).expect("remove central root");
        let _ = fs::remove_file(&link_path);
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
        fs::remove_dir_all(&real_target).expect("remove link target");
    }

    #[test]
    fn removes_only_a_safe_directory_without_valid_skill_md() {
        let layout = test_layout("remove-invalid");
        layout.ensure_roots().expect("create layout");
        let invalid = layout.public_root.join("broken-entry");
        fs::create_dir_all(&invalid).expect("create invalid dir");

        let item = scan(&layout)
            .expect("scan should succeed")
            .items
            .into_iter()
            .next()
            .expect("invalid item present");
        assert!(item.removable);
        remove_invalid(&layout, &item.name).expect("invalid item should be removable");
        assert!(!invalid.exists());

        fs::remove_dir_all(&layout.root).expect("remove central root");
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }

    #[test]
    fn renames_a_folder_to_the_declared_skill_name() {
        let layout = test_layout("rename-mismatch");
        layout.ensure_roots().expect("create layout");
        let original = layout.public_root.join("renamed-notes");
        fs::create_dir_all(&original).expect("create mismatch dir");
        fs::write(
            original.join("SKILL.md"),
            "---\nname: notes-helper\ndescription: Notes helper.\n---\n",
        )
        .expect("write manifest");

        let item = scan(&layout)
            .expect("scan should succeed")
            .items
            .into_iter()
            .next()
            .expect("mismatch item present");
        assert_eq!(item.declared_name.as_deref(), Some("notes-helper"));
        let next_name = rename_mismatch(&layout, &item.name).expect("rename should succeed");
        assert_eq!(next_name, "notes-helper");
        assert!(!original.exists());
        assert!(layout.public_root.join("notes-helper").is_dir());

        fs::remove_dir_all(&layout.root).expect("remove central root");
        fs::remove_dir_all(&layout.public_root).expect("remove public root");
    }
}
