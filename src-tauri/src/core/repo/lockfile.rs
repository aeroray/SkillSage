use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::SkillsageError;

use super::layout::RepoLayout;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionRecord {
    pub commit: String,
    pub hash: String,
    pub recorded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillLockRecord {
    pub id: String,
    pub name: String,
    pub owner: String,
    pub repo: String,
    #[serde(default)]
    pub skill_path: Option<String>,
    pub source: String,
    #[serde(rename = "currentVersion")]
    pub current_version: String,
    #[serde(rename = "currentHash")]
    pub current_hash: String,
    #[serde(rename = "distributedTo", default)]
    pub distributed_to: Vec<String>,
    pub installed_at: String,
    #[serde(default)]
    pub version_history: Vec<VersionRecord>,
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
            version: 1,
            skills: BTreeMap::new(),
        }
    }
}

pub fn load(layout: &RepoLayout) -> Result<SkillLockFile, SkillsageError> {
    let path = layout.lock_path();
    if !path.exists() {
        return Ok(SkillLockFile::default());
    }
    let content = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

pub fn save(layout: &RepoLayout, lockfile: &SkillLockFile) -> Result<(), SkillsageError> {
    layout.ensure_roots()?;
    let temporary_path = layout.lock_root().join("skill-lock.json.tmp");
    let content = serde_json::to_string_pretty(lockfile)?;
    std::fs::write(&temporary_path, format!("{content}\n"))?;
    if layout.lock_path().exists() {
        std::fs::remove_file(layout.lock_path())?;
    }
    std::fs::rename(temporary_path, layout.lock_path())?;
    Ok(())
}

pub fn content_hash(root: &Path) -> Result<String, SkillsageError> {
    let mut files = Vec::new();
    collect_files(root, root, &mut files)?;
    files.sort();

    let mut hasher = blake3::Hasher::new();
    for relative_path in files {
        hasher.update(relative_path.to_string_lossy().as_bytes());
        hasher.update(&[0]);
        hasher.update(&std::fs::read(root.join(&relative_path))?);
        hasher.update(&[0]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

fn collect_files(
    root: &Path,
    current: &Path,
    output: &mut Vec<PathBuf>,
) -> Result<(), SkillsageError> {
    for entry in std::fs::read_dir(current)? {
        let path = entry?.path();
        if path.is_dir() {
            collect_files(root, &path, output)?;
        } else if path.is_file() {
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

    use super::content_hash;

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
}
