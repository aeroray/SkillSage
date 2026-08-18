use std::path::{Component, Path, PathBuf};

use crate::error::SkillsageError;

#[derive(Debug, Clone)]
pub struct RepoLayout {
    pub root: PathBuf,
}

impl RepoLayout {
    pub fn from_user_home() -> Result<Self, SkillsageError> {
        let home = dirs::home_dir().ok_or(SkillsageError::HomeDirectoryUnavailable)?;
        Ok(Self::new(home.join(".skillsage")))
    }

    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn remote_root(&self) -> PathBuf {
        self.root.join("remote")
    }

    pub fn local_root(&self) -> PathBuf {
        self.root.join("local")
    }

    pub fn remote_skill(&self, owner: &str, skill: &str) -> Result<PathBuf, SkillsageError> {
        Ok(self
            .remote_root()
            .join(safe_component(owner)?)
            .join(safe_component(skill)?))
    }

    pub fn local_skill(&self, skill: &str) -> Result<PathBuf, SkillsageError> {
        Ok(self.local_root().join(safe_component(skill)?))
    }

    pub fn lock_root(&self) -> PathBuf {
        self.root.join("lock")
    }

    pub fn lock_path(&self) -> PathBuf {
        self.lock_root().join("skill-lock.json")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    pub fn snapshots_root(&self) -> PathBuf {
        self.lock_root().join("snapshots")
    }

    pub fn snapshot_skill(&self, owner: &str, skill: &str) -> Result<PathBuf, SkillsageError> {
        Ok(self
            .snapshots_root()
            .join(safe_component(owner)?)
            .join(safe_component(skill)?))
    }

    pub fn tmp_root(&self) -> PathBuf {
        self.root.join("tmp")
    }

    pub fn ensure_roots(&self) -> Result<(), SkillsageError> {
        std::fs::create_dir_all(self.remote_root())?;
        std::fs::create_dir_all(self.local_root())?;
        std::fs::create_dir_all(self.lock_root())?;
        std::fs::create_dir_all(self.snapshots_root())?;
        std::fs::create_dir_all(self.tmp_root())?;
        Ok(())
    }
}

fn safe_component(value: &str) -> Result<&str, SkillsageError> {
    let path = Path::new(value);
    if value.is_empty()
        || path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
    {
        return Err(SkillsageError::InvalidSkill(format!(
            "路径片段不安全: {value}"
        )));
    }
    Ok(value)
}
