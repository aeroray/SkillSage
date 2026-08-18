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

    pub fn exports_root(&self) -> PathBuf {
        self.root.join("exports")
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
        ensure_real_directory(&self.root, "中央仓库")?;
        ensure_real_directory(&self.remote_root(), "remote 仓库")?;
        ensure_real_directory(&self.local_root(), "local 仓库")?;
        ensure_real_directory(&self.lock_root(), "lock 目录")?;
        ensure_real_directory(&self.snapshots_root(), "快照目录")?;
        ensure_real_directory(&self.tmp_root(), "临时目录")?;
        ensure_real_directory(&self.exports_root(), "导出目录")?;
        Ok(())
    }
}

fn ensure_real_directory(path: &Path, label: &str) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(SkillsageError::Io(format!(
            "{label}路径不能是符号链接: {}",
            path.display()
        ))),
        Ok(metadata) if !metadata.is_dir() => Err(SkillsageError::Io(format!(
            "{label}路径不是目录: {}",
            path.display()
        ))),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            match std::fs::create_dir(path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    match std::fs::symlink_metadata(path) {
                        Ok(metadata) if metadata.file_type().is_symlink() => {
                            Err(SkillsageError::Io(format!(
                                "{label}路径不能是符号链接: {}",
                                path.display()
                            )))
                        }
                        Ok(metadata) if metadata.is_dir() => Ok(()),
                        Ok(_) => Err(SkillsageError::Io(format!(
                            "{label}路径不是目录: {}",
                            path.display()
                        ))),
                        Err(error) => Err(error.into()),
                    }
                }
                Err(error) => Err(error.into()),
            }
        }
        Err(error) => Err(error.into()),
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
