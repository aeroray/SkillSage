use std::path::Path;

use crate::error::SkillsageError;

use super::{client::GitHubClient, tree::find_skill_files};

pub async fn download_skill_directory(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
    destination: &Path,
) -> Result<Vec<String>, SkillsageError> {
    let files = find_skill_files(client, owner, repo, commit, skill_path).await?;
    let prefix = skill_path.trim_matches('/');
    for file in &files {
        let relative_path = file
            .strip_prefix(prefix)
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
