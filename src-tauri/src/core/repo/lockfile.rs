use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::SkillsageError;

use super::{atomic, layout::RepoLayout};

/// The lockfile format version this build reads and writes. Bumped from 1 to
/// 2 alongside the single-shared-directory redesign; tool compatibility
/// distribution fields are optional for backwards compatibility.
pub const LOCK_FORMAT_VERSION: u32 = 2;

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
    #[serde(default)]
    pub claude_distributed: bool,
    #[serde(default)]
    pub workbuddy_distributed: bool,
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
    let parsed: SkillLockFile = serde_json::from_str(&content)?;
    if parsed.version != LOCK_FORMAT_VERSION {
        // A pre-cutover (version 1) lock file describes skills that were
        // distributed via per-tool symlinks under the old model; those
        // records no longer map to anything under the new flat
        // `layout.skill(name)` scheme. Rather than silently accept the old
        // JSON (serde would just ignore the now-removed `distributedTo`
        // field) and produce lock records pointing at nothing, treat it as
        // absent. The old ~/.skillsage content and tool symlinks are left
        // untouched on disk, just untracked, per the clean-slate cutover.
        return Ok(SkillLockFile::default());
    }
    Ok(parsed)
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

    use super::{content_hash, content_hash_files};

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
