use std::path::Path;

use crate::error::SkillsageError;

use super::{client::GitHubClient, tree::find_skill_files};

use crate::core::store::models::SkillFile;

pub async fn fetch_skill_files(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
) -> Result<Vec<SkillFile>, SkillsageError> {
    let files = find_skill_files(client, owner, repo, commit, skill_path).await?;
    let actual_prefix = files
        .iter()
        .find_map(|file| file.strip_suffix("/SKILL.md"))
        .unwrap_or("")
        .to_string();
    let mut downloaded = Vec::with_capacity(files.len());
    for file in files {
        let url = format!("https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{file}");
        downloaded.push(SkillFile {
            path: file
                .strip_prefix(&actual_prefix)
                .unwrap_or(&file)
                .trim_start_matches('/')
                .to_string(),
            contents: client.get_text(&url).await?,
        });
    }
    Ok(downloaded)
}

pub async fn download_skill_directory(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
    destination: &Path,
) -> Result<Vec<String>, SkillsageError> {
    let files = find_skill_files(client, owner, repo, commit, skill_path).await?;
    let actual_prefix = files
        .iter()
        .find_map(|file| file.strip_suffix("/SKILL.md"))
        .unwrap_or("")
        .to_string();
    for file in &files {
        let relative_path = file
            .strip_prefix(&actual_prefix)
            .unwrap_or(file)
            .trim_start_matches('/');
        let target = destination.join(relative_path);
        if let Some(parent) = target.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let url = format!("https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{file}");
        let content = client.get_text(&url).await?;
        tokio::fs::write(target, content).await?;
    }
    Ok(files)
}
