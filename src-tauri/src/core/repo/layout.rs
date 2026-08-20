use std::path::{Component, Path, PathBuf};

use crate::error::SkillsageError;

/// `root` holds only SkillSage's own bookkeeping (lock file, snapshots, tmp,
/// settings) — never skill content. `public_root` is the single shared
/// directory (`~/.agents/skills`) every skill installs into directly, flat,
/// with no per-tool or per-owner subfolders. Every AI tool that reads skills
/// from this location reads real content here, not a link into `root`.
#[derive(Debug, Clone)]
pub struct RepoLayout {
    pub root: PathBuf,
    pub public_root: PathBuf,
}

impl RepoLayout {
    pub fn from_user_home() -> Result<Self, SkillsageError> {
        let home = dirs::home_dir().ok_or(SkillsageError::HomeDirectoryUnavailable)?;
        Ok(Self::new(
            home.join(".skillsage"),
            home.join(".agents").join("skills"),
        ))
    }

    pub fn new(root: PathBuf, public_root: PathBuf) -> Self {
        Self { root, public_root }
    }

    /// The single flat path a skill named `name` lives at. Replaces the old
    /// owner-namespaced `remote_skill()`/flat `local_skill()` split — every
    /// skill, regardless of source, lands at the same kind of path now.
    pub fn skill(&self, name: &str) -> Result<PathBuf, SkillsageError> {
        Ok(self.public_root.join(safe_component(name)?))
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

    pub fn snapshot_skill(&self, name: &str) -> Result<PathBuf, SkillsageError> {
        Ok(self.snapshots_root().join(safe_component(name)?))
    }

    pub fn tmp_root(&self) -> PathBuf {
        self.root.join("tmp")
    }

    pub fn ensure_roots(&self) -> Result<(), SkillsageError> {
        ensure_real_directory(&self.root, "中央仓库")?;
        ensure_real_directory(&self.lock_root(), "lock 目录")?;
        ensure_real_directory(&self.snapshots_root(), "快照目录")?;
        ensure_real_directory(&self.tmp_root(), "临时目录")?;
        // public_root is commonly two levels below home (~/.agents/skills) and
        // ~/.agents may not exist yet on a machine with no other AI tool
        // installed. ensure_real_directory only creates a single level, so the
        // parent needs an unguarded create_dir_all first. We don't manage
        // ~/.agents itself (another tool might own it), only our own `skills`
        // child gets the same symlink-rejection guard every other managed
        // root has.
        if let Some(parent) = self.public_root.parent() {
            std::fs::create_dir_all(parent)?;
        }
        ensure_real_directory(&self.public_root, "公共技能目录")?;
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

#[cfg(test)]
mod tests {
    use super::RepoLayout;

    /// `ensure_real_directory` deliberately creates only a single path
    /// segment at a time (never `create_dir_all`), so it never silently
    /// walks through a symlinked intermediate ancestor on the way to a
    /// managed root. That means every test-constructed layout needs its
    /// shared parent pre-created for real, exactly like `home` always
    /// already exists in production.
    fn test_layout(root: &std::path::Path) -> RepoLayout {
        std::fs::create_dir_all(root).expect("create shared test parent");
        RepoLayout::new(root.join("central"), root.join("public"))
    }

    #[test]
    fn ensure_roots_creates_public_root_when_parent_is_missing() {
        let root = std::env::temp_dir().join(format!(
            "skillsage-layout-public-root-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let layout = test_layout(&root);
        // public_root's parent (root/agents) does not exist yet even though
        // `root` itself does, exercising the two-level create_dir_all path.
        let layout = RepoLayout::new(layout.root, root.join("agents/skills"));
        layout.ensure_roots().expect("ensure_roots should succeed");
        assert!(layout.public_root.is_dir());
        std::fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn skill_rejects_unsafe_names() {
        let root = std::env::temp_dir().join(format!(
            "skillsage-layout-safe-component-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let layout = test_layout(&root);
        assert!(layout.skill("../escape").is_err());
        assert!(layout.skill("").is_err());
        assert!(layout.skill("ok-name").is_ok());
        std::fs::remove_dir_all(root).expect("remove test root");
    }
}
