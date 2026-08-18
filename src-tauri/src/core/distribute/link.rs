use std::path::Path;

use crate::error::SkillsageError;

pub fn create_link(source: &Path, target: &Path) -> Result<(), SkillsageError> {
    let source_metadata =
        std::fs::symlink_metadata(source).map_err(|error| SkillsageError::LinkCreation {
            path: target.to_path_buf(),
            reason: format!("源目录不可用: {error}"),
        })?;
    if !source_metadata.is_dir() || is_link_metadata(&source_metadata) {
        return Err(SkillsageError::LinkCreation {
            path: target.to_path_buf(),
            reason: "源路径不是受 SkillSage 管理的真实目录".to_string(),
        });
    }
    if std::fs::symlink_metadata(target).is_ok() {
        return Err(SkillsageError::LinkCreation {
            path: target.to_path_buf(),
            reason: "目标路径已存在".to_string(),
        });
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }

    #[cfg(windows)]
    {
        let output = std::process::Command::new("cmd")
            .arg("/C")
            .arg("mklink")
            .arg("/J")
            .arg(target)
            .arg(source)
            .output()
            .map_err(|error| SkillsageError::LinkCreation {
                path: target.to_path_buf(),
                reason: error.to_string(),
            })?;
        if !output.status.success() {
            return Err(SkillsageError::LinkCreation {
                path: target.to_path_buf(),
                reason: String::from_utf8_lossy(&output.stderr).trim().to_string(),
            });
        }
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(source, target).map_err(|error| SkillsageError::LinkCreation {
        path: target.to_path_buf(),
        reason: error.to_string(),
    })?;

    Ok(())
}

pub fn remove_link(target: &Path) -> Result<(), SkillsageError> {
    let metadata = match std::fs::symlink_metadata(target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(SkillsageError::LinkRemoval {
                path: target.to_path_buf(),
                reason: error.to_string(),
            })
        }
    };
    if !is_link_metadata(&metadata) {
        return Err(SkillsageError::LinkRemoval {
            path: target.to_path_buf(),
            reason: "目标不是 SkillSage 创建的链接，已拒绝删除".to_string(),
        });
    }

    #[cfg(windows)]
    std::fs::remove_dir(target).map_err(|error| SkillsageError::LinkRemoval {
        path: target.to_path_buf(),
        reason: error.to_string(),
    })?;

    #[cfg(unix)]
    std::fs::remove_file(target).map_err(|error| SkillsageError::LinkRemoval {
        path: target.to_path_buf(),
        reason: error.to_string(),
    })?;

    Ok(())
}

fn is_link_metadata(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        let file_type = metadata.file_type();
        file_type.is_symlink() || file_type.is_symlink_dir() || file_type.is_symlink_file()
    }
    #[cfg(unix)]
    {
        metadata.file_type().is_symlink()
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{create_link, remove_link};

    #[test]
    fn creates_and_removes_platform_link() {
        let root = std::env::temp_dir().join(format!("SkillSage link test {}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).expect("create source");
        fs::write(source.join("SKILL.md"), "test").expect("write source");

        create_link(&source, &target).expect("link should be created");
        assert!(target.join("SKILL.md").is_file());
        remove_link(&target).expect("link should be removed");
        assert!(!target.exists());
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[cfg(unix)]
    #[test]
    fn removes_broken_symlink_without_following_it() {
        use std::os::unix::fs::symlink;

        let root =
            std::env::temp_dir().join(format!("SkillSage broken link test {}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create test root");
        let target = root.join("target");
        symlink(root.join("missing-source"), &target).expect("create broken link");

        remove_link(&target).expect("broken link should be removed");
        assert!(fs::symlink_metadata(&target).is_err());
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn refuses_to_remove_a_real_directory() {
        let root =
            std::env::temp_dir().join(format!("SkillSage real target test {}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let target = root.join("target");
        fs::create_dir_all(&target).expect("create real target");

        assert!(remove_link(&target).is_err());
        assert!(target.is_dir());
        fs::remove_dir_all(root).expect("remove test root");
    }
}
