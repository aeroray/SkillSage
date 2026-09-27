use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::SkillsageError;

use super::{atomic, layout::RepoLayout};

/// The lockfile format version this build reads and writes. Bumped from 1 to 2
/// alongside the single-shared-directory redesign, and from 2 to 3 when the two
/// hardcoded tool booleans were replaced by a registry-driven `distributedTo`
/// list. A version 2 file still loads: its `claudeDistributed` /
/// `workbuddyDistributed` flags are folded into `distributedTo` on read.
pub const LOCK_FORMAT_VERSION: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillLockRecord {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub repo: String,
    #[serde(default, alias = "skill_path")]
    pub skill_path: Option<String>,
    pub source: String,
    #[serde(alias = "current_version")]
    pub current_version: String,
    #[serde(alias = "current_hash")]
    pub current_hash: String,
    #[serde(alias = "installed_at")]
    pub installed_at: String,
    #[serde(default)]
    pub description: String,
    /// Tool ids this skill is currently linked into. Replaces the old
    /// `claudeDistributed` / `workbuddyDistributed` booleans, which could not
    /// express a tool registry and silently kept reporting a tool that had
    /// been uninstalled.
    #[serde(default)]
    pub distributed_to: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillLockFile {
    pub version: u32,
    #[serde(default)]
    pub skills: BTreeMap<String, SkillLockRecord>,
}

impl Default for SkillLockFile {
    fn default() -> Self {
        Self {
            version: LOCK_FORMAT_VERSION,
            skills: BTreeMap::new(),
        }
    }
}

pub fn load(layout: &RepoLayout) -> Result<SkillLockFile, SkillsageError> {
    let path = layout.lock_path();
    match std::fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(SkillsageError::Io("lock 文件不能是符号链接".into()))
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err(SkillsageError::Io("lock 路径不是普通文件".into()))
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(SkillLockFile::default());
        }
        Err(error) => return Err(error.into()),
    }
    let content = std::fs::read_to_string(path)?;
    // Read the version before deserializing the records. A pre-cutover file
    // does not satisfy the current record shape, so parsing it into
    // `SkillLockFile` first would surface a deserialization error for a file
    // that is supposed to be treated as absent.
    let version = serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .and_then(|value| value.get("version").and_then(|v| v.as_u64()));
    match version {
        // Current format.
        Some(version) if version == u64::from(LOCK_FORMAT_VERSION) => {
            Ok(serde_json::from_str(&content)?)
        }
        // The two-boolean tool format. Its records are still valid — same
        // paths, same hashes — only the distribution representation changed,
        // so fold the flags into the list and upgrade in place rather than
        // discarding real installed-skill metadata.
        Some(2) => migrate_from_v2(&content),
        // A version 1 file describes skills that were distributed via per-tool
        // symlinks under the old central-repository model; those records no
        // longer map to anything under the flat `layout.skill(name)` scheme.
        // Treat it as absent. The old ~/.skillsage content and tool symlinks
        // are left on disk, untracked, per the clean-slate cutover.
        //
        // An unreadable or unversioned file is treated the same way rather
        // than failing every command that touches the lock file.
        _ => Ok(SkillLockFile::default()),
    }
}

/// Folds the version 2 `claudeDistributed` / `workbuddyDistributed` booleans
/// into `distributedTo`.
///
/// This runs on the raw JSON rather than through serde aliases so that the
/// current `SkillLockRecord` carries no vestigial fields: the two booleans are
/// gone from the type entirely, and the old keys are understood only here, at
/// the one place that reads an old file.
fn migrate_from_v2(content: &str) -> Result<SkillLockFile, SkillsageError> {
    let mut value: serde_json::Value = serde_json::from_str(content)?;
    if let Some(skills) = value.get_mut("skills").and_then(|s| s.as_object_mut()) {
        for record in skills.values_mut() {
            let Some(object) = record.as_object_mut() else {
                continue;
            };
            let mut targets: Vec<String> = object
                .get("distributedTo")
                .and_then(|value| value.as_array())
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(|entry| entry.as_str().map(ToOwned::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            // The old flag names map to the ids the registry uses today.
            for (key, id) in [
                ("claudeDistributed", "claude-code"),
                ("workbuddyDistributed", "codebuddy"),
            ] {
                let present = object
                    .remove(key)
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false);
                if present && !targets.iter().any(|entry| entry == id) {
                    targets.push(id.to_string());
                }
            }
            object.insert(
                "distributedTo".to_string(),
                serde_json::Value::Array(
                    targets.into_iter().map(serde_json::Value::String).collect(),
                ),
            );
        }
    }
    value["version"] = serde_json::Value::from(LOCK_FORMAT_VERSION);
    Ok(serde_json::from_value(value)?)
}

pub fn save(layout: &RepoLayout, lockfile: &SkillLockFile) -> Result<(), SkillsageError> {
    layout.ensure_roots()?;
    let temporary_path = layout.lock_root().join("skill-lock.json.tmp");
    if let Ok(metadata) = std::fs::symlink_metadata(&temporary_path) {
        if metadata.file_type().is_symlink() {
            return Err(SkillsageError::Io(format!(
                "锁文件临时路径不能是符号链接: {}",
                temporary_path.display()
            )));
        }
        std::fs::remove_file(&temporary_path)?;
    }
    let content = serde_json::to_string_pretty(lockfile)?;
    std::fs::write(&temporary_path, format!("{content}\n"))?;
    atomic::replace_file(&temporary_path, &layout.lock_path())?;
    Ok(())
}

pub fn content_hash(root: &Path) -> Result<String, SkillsageError> {
    let mut files = Vec::new();
    collect_files(root, root, &mut files)?;
    // Sort by the same normalized string key `content_hash_files` uses. Sorting
    // `PathBuf` values instead compares *components*, which disagrees with
    // string order whenever a directory name shares a prefix with a sibling
    // file (e.g. `a/b` vs `a-b`). A tree read from disk and the same tree held
    // in memory must produce one hash, otherwise update checks report a
    // permanent false "update available".
    let mut entries = files
        .into_iter()
        .map(|relative_path| {
            let normalized_path = relative_path.to_string_lossy().replace('\\', "/");
            (normalized_path, relative_path)
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.0.cmp(&right.0));

    let mut hasher = blake3::Hasher::new();
    for (normalized_path, relative_path) in entries {
        hasher.update(normalized_path.as_bytes());
        hasher.update(&[0]);
        hasher.update(&std::fs::read(root.join(&relative_path))?);
        hasher.update(&[0]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

pub fn content_hash_files(files: &[(String, Vec<u8>)]) -> String {
    let mut sorted = files.to_vec();
    sorted.sort_by(|left, right| left.0.cmp(&right.0));

    let mut hasher = blake3::Hasher::new();
    for (relative_path, contents) in sorted {
        hasher.update(relative_path.replace('\\', "/").as_bytes());
        hasher.update(&[0]);
        hasher.update(&contents);
        hasher.update(&[0]);
    }
    hasher.finalize().to_hex().to_string()
}

fn collect_files(
    root: &Path,
    current: &Path,
    output: &mut Vec<PathBuf>,
) -> Result<(), SkillsageError> {
    for entry in std::fs::read_dir(current)? {
        let path = entry?.path();
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            return Err(SkillsageError::Io(format!(
                "技能内容不能包含符号链接: {}",
                path.display()
            )));
        }
        if metadata.is_dir() {
            collect_files(root, &path, output)?;
        } else if metadata.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| SkillsageError::Io(error.to_string()))?
                .to_path_buf();
            output.push(relative);
        }
    }
    Ok(())
}

pub fn unix_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{content_hash, content_hash_files, load, LOCK_FORMAT_VERSION};
    use crate::core::repo::layout::RepoLayout;

    /// A version 2 lock file carried `claudeDistributed` /
    /// `workbuddyDistributed` booleans. Reading one must keep the installed
    /// skills and translate those flags into the registry's tool ids, rather
    /// than discarding real metadata.
    #[test]
    fn migrates_a_version_2_lock_file_into_distribution_targets() {
        let root = std::env::temp_dir().join(format!("skillsage-lock-v2-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("central/lock")).expect("create lock dir");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));

        let v2 = r#"{
  "version": 2,
  "skills": {
    "demo": {
      "id": "demo",
      "name": "demo",
      "owner": "o",
      "repo": "r",
      "source": "https://example.test/o/r",
      "currentVersion": "abc",
      "currentHash": "hash",
      "installedAt": "1",
      "description": "d",
      "claudeDistributed": true,
      "workbuddyDistributed": true
    },
    "other": {
      "id": "other",
      "name": "other",
      "owner": "o",
      "repo": "r",
      "source": "https://example.test/o/r",
      "currentVersion": "abc",
      "currentHash": "hash",
      "installedAt": "1",
      "description": "d",
      "claudeDistributed": false,
      "workbuddyDistributed": false
    }
  }
}"#;
        fs::write(layout.lock_path(), v2).expect("write v2 lock");

        let lock = load(&layout).expect("v2 lock should load");
        assert_eq!(lock.version, LOCK_FORMAT_VERSION);
        assert_eq!(lock.skills.len(), 2, "records must be preserved");

        let mut migrated = lock.skills["demo"].distributed_to.clone();
        migrated.sort();
        assert_eq!(migrated, vec!["claude-code".to_string(), "codebuddy".to_string()]);
        assert!(lock.skills["other"].distributed_to.is_empty());

        // Saving must emit the new format, with the old keys gone.
        super::save(&layout, &lock).expect("save");
        let written = fs::read_to_string(layout.lock_path()).expect("read back");
        assert!(!written.contains("claudeDistributed"));
        assert!(!written.contains("workbuddyDistributed"));
        assert!(written.contains("distributedTo"));

        fs::remove_dir_all(root).expect("remove test root");
    }

    /// A pre-cutover version 1 file describes the old central-repository model
    /// and must still be treated as absent rather than partially parsed.
    #[test]
    fn a_version_1_lock_file_is_treated_as_absent() {
        let root = std::env::temp_dir().join(format!("skillsage-lock-v1-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("central/lock")).expect("create lock dir");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        fs::write(
            layout.lock_path(),
            r#"{"version":1,"skills":{"old":{"id":"old","name":"old"}}}"#,
        )
        .expect("write v1 lock");

        let lock = load(&layout).expect("v1 lock should load as empty");
        assert!(lock.skills.is_empty());

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn content_hash_is_stable_for_same_files() {
        let root = std::env::temp_dir().join(format!("skillsage-hash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("nested")).expect("create test dir");
        fs::write(root.join("nested/file.txt"), "hello").expect("write test file");

        let first = content_hash(&root).expect("hash should work");
        let second = content_hash(&root).expect("hash should be stable");
        assert_eq!(first, second);
        fs::remove_dir_all(root).expect("remove test dir");
    }

    #[test]
    fn disk_and_memory_hashes_agree_across_component_sorting() {
        // PathBuf's Ord compares *components*, while the in-memory variant
        // sorts normalized path strings. `a-b` vs `a/b` is where those two
        // orders disagree.
        let root = std::env::temp_dir().join(format!(
            "skillsage-hash-ordering-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("a")).expect("create test dir");
        fs::write(root.join("a/b"), "nested").expect("write nested file");
        fs::write(root.join("a-b"), "flat").expect("write flat file");

        let disk_hash = content_hash(&root).expect("disk hash should work");
        let memory_hash = content_hash_files(&[
            ("a/b".into(), b"nested".to_vec()),
            ("a-b".into(), b"flat".to_vec()),
        ]);
        assert_eq!(memory_hash, disk_hash);
        fs::remove_dir_all(root).expect("remove test dir");
    }

    #[test]
    fn in_memory_hash_supports_binary_skill_files() {
        let root =
            std::env::temp_dir().join(format!("skillsage-binary-hash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("assets")).expect("create test dir");
        let bytes = vec![0, 159, 146, 150, 255];
        fs::write(root.join("assets/image.bin"), &bytes).expect("write binary test file");

        let disk_hash = content_hash(&root).expect("disk hash should work");
        let memory_hash = content_hash_files(&[("assets/image.bin".into(), bytes)]);
        assert_eq!(memory_hash, disk_hash);
        fs::remove_dir_all(root).expect("remove test dir");
    }
}
