use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::SkillsageError;

use super::layout::RepoLayout;

pub fn create_temp_dir(layout: &RepoLayout) -> Result<PathBuf, SkillsageError> {
    layout.ensure_roots()?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| SkillsageError::Io(error.to_string()))?
        .as_nanos();
    let path = layout
        .tmp_root()
        .join(format!("install-{}-{timestamp}", std::process::id()));
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

pub fn commit_dir(temp_dir: &Path, destination: &Path) -> Result<(), SkillsageError> {
    if destination.exists() {
        return Err(SkillsageError::AlreadyInstalled(
            destination.display().to_string(),
        ));
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(temp_dir, destination)?;
    Ok(())
}

pub fn remove_dir(path: &Path) -> Result<(), SkillsageError> {
    if path.exists() {
        std::fs::remove_dir_all(path)?;
    }
    Ok(())
}
