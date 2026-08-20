use serde::Serialize;

use crate::core::import::source::validate_tree;
use crate::core::paths;
use crate::core::repo::conflict;
use crate::core::repo::layout::RepoLayout;
use crate::core::repo::lockfile;
use crate::core::skill::parser::read_skill_md;
use crate::error::SkillsageError;

/// A folder already sitting in the shared public directory that SkillSage
/// doesn't yet track — either placed there by another tool/process, or
/// left over from before this machine used SkillSage at all. The folder
/// name is authoritative for adoption (see `execute_at`), since adoption
/// never moves files and a SKILL.md's declared name may not match it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptableItem {
    pub name: String,
    pub declared_name: Option<String>,
    pub description: String,
    pub path: String,
    pub valid: bool,
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
                recommended: false,
                warning: Some(error.to_string()),
            }
        } else {
            match read_skill_md(&path.join("SKILL.md")) {
                Ok(parsed) => {
                    let declared_name =
                        (parsed.manifest.name != name).then_some(parsed.manifest.name);
                    let warning = declared_name.as_ref().map(|declared| {
                        format!(
                            "SKILL.md 中的名称为 {declared}，与文件夹名不同；采纳后将使用文件夹名 {name}。"
                        )
                    });
                    AdoptableItem {
                        recommended: declared_name.is_none(),
                        name,
                        declared_name,
                        description: parsed.manifest.description,
                        path: display_path,
                        valid: true,
                        warning,
                    }
                }
                Err(_) => AdoptableItem {
                    name,
                    declared_name: None,
                    description: String::new(),
                    path: display_path,
                    valid: false,
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

#[cfg(test)]
mod tests {
    use std::fs;

    use super::scan;
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
}
