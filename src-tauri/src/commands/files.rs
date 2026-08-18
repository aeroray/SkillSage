use std::path::{Path, PathBuf};
use std::process::Command;

use crate::core::lifecycle::remote;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::error::SkillsageError;

#[tauri::command]
pub async fn open_path(path: String) -> Result<(), SkillsageError> {
    tokio::task::spawn_blocking(move || open_directory(Path::new(&path)))
        .await
        .map_err(|error| SkillsageError::Task(error.to_string()))?
}

#[tauri::command]
pub async fn open_skill_directory(skill_id: String) -> Result<(), SkillsageError> {
    tokio::task::spawn_blocking(move || {
        let layout = RepoLayout::from_user_home()?;
        let record = lockfile::load(&layout)?
            .skills
            .get(&skill_id)
            .cloned()
            .ok_or_else(|| SkillsageError::NotInstalled(skill_id.clone()))?;
        let path = if remote::is_remote_record(&record) {
            layout.remote_skill(&record.owner, &record.name)?
        } else {
            layout.local_skill(&record.name)?
        };
        open_directory(&path)
    })
    .await
    .map_err(|error| SkillsageError::Task(error.to_string()))?
}

fn open_directory(path: &Path) -> Result<(), SkillsageError> {
    if !path.is_dir() {
        return Err(SkillsageError::PathNotFound(PathBuf::from(path)));
    }

    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer.exe");
    #[cfg(target_os = "windows")]
    command.arg(path);

    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "macos")]
    command.arg(path);

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    #[cfg(all(unix, not(target_os = "macos")))]
    command.arg(path);

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| SkillsageError::Io(format!("打开目录失败：{error}")))
}
