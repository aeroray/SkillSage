use std::path::Path;

use crate::error::SkillsageError;

pub fn create_link(source: &Path, target: &Path) -> Result<(), SkillsageError> {
    if target.exists() {
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
    if !target.exists() {
        return Ok(());
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
}
