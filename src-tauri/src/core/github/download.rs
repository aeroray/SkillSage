use crate::error::SkillsageError;
use std::sync::Arc;

use super::super::limits::{MAX_REMOTE_SKILL_FILES, MAX_REMOTE_SKILL_TOTAL_BYTES};
use super::{
    client::GitHubClient,
    tree::{find_skill_files, find_skill_files_with_path},
};

use crate::core::store::models::SkillFile;

const MAX_CONCURRENT_FILE_DOWNLOADS: usize = 8;

pub struct SkillProbe {
    pub skill_md: String,
    pub files: Option<Vec<SkillFile>>,
}

pub async fn fetch_skill_files(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
) -> Result<Vec<SkillFile>, SkillsageError> {
    let files = find_skill_files(client, owner, repo, commit, skill_path).await?;
    download_files(client, owner, repo, commit, files, None).await
}

pub async fn fetch_skill_files_with_path(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
) -> Result<(String, Vec<SkillFile>), SkillsageError> {
    let (resolved_path, files) =
        find_skill_files_with_path(client, owner, repo, commit, skill_path).await?;
    let downloaded = download_files(client, owner, repo, commit, files, None).await?;
    Ok((resolved_path, downloaded))
}

pub async fn fetch_skill_files_with_probe(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    skill_path: &str,
    local_skill_md: &str,
) -> Result<SkillProbe, SkillsageError> {
    let files = find_skill_files(client, owner, repo, commit, skill_path).await?;
    if files.len() > MAX_REMOTE_SKILL_FILES {
        return Err(SkillsageError::ResponseTooLarge(format!(
            "技能目录包含超过 {MAX_REMOTE_SKILL_FILES} 个文件"
        )));
    }
    let skill_file = files
        .iter()
        .find(|file| file.ends_with("/SKILL.md") || *file == "SKILL.md")
        .cloned()
        .ok_or_else(|| SkillsageError::PathNotFound("SKILL.md".into()))?;
    let url = format!("https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{skill_file}");
    let contents = client.get_text(&url).await?;
    if contents != local_skill_md {
        return Ok(SkillProbe {
            skill_md: contents,
            files: None,
        });
    }
    let files = download_files(
        client,
        owner,
        repo,
        commit,
        files,
        Some((skill_file, contents.clone())),
    )
    .await?;
    Ok(SkillProbe {
        skill_md: contents,
        files: Some(files),
    })
}

async fn download_files(
    client: &GitHubClient,
    owner: &str,
    repo: &str,
    commit: &str,
    files: Vec<String>,
    prefetched: Option<(String, String)>,
) -> Result<Vec<SkillFile>, SkillsageError> {
    if files.len() > MAX_REMOTE_SKILL_FILES {
        return Err(SkillsageError::ResponseTooLarge(format!(
            "技能目录包含超过 {MAX_REMOTE_SKILL_FILES} 个文件"
        )));
    }
    let actual_prefix = files
        .iter()
        .find_map(|file| file.strip_suffix("/SKILL.md"))
        .unwrap_or("")
        .to_string();
    let prefetched_path = prefetched.as_ref().map(|(path, _)| path.as_str());
    let prefetched_contents = prefetched.as_ref().map(|(_, contents)| contents.clone());
    let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_FILE_DOWNLOADS));
    let mut jobs = tokio::task::JoinSet::new();
    let mut downloaded = Vec::with_capacity(files.len());
    let mut total_bytes = prefetched_contents.as_ref().map_or(0, String::len);

    if let (Some(path), Some(contents)) = (prefetched_path, prefetched_contents) {
        downloaded.push(SkillFile {
            path: relative_path(path, &actual_prefix),
            contents: contents.into_bytes(),
        });
    }

    for file in files {
        if prefetched_path == Some(file.as_str()) {
            continue;
        }
        let client = client.clone();
        let owner = owner.to_string();
        let repo = repo.to_string();
        let commit = commit.to_string();
        let actual_prefix = actual_prefix.clone();
        let semaphore = semaphore.clone();
        jobs.spawn(async move {
            let _permit = semaphore
                .acquire_owned()
                .await
                .map_err(|error| SkillsageError::Task(error.to_string()))?;
            let url = format!("https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{file}");
            let contents = client.get_bytes(&url).await?;
            Ok::<SkillFile, SkillsageError>(SkillFile {
                path: relative_path(&file, &actual_prefix),
                contents,
            })
        });
    }

    while let Some(result) = jobs.join_next().await {
        let file = result.map_err(|error| SkillsageError::Task(error.to_string()))??;
        total_bytes = total_bytes.saturating_add(file.contents.len());
        if total_bytes > MAX_REMOTE_SKILL_TOTAL_BYTES {
            return Err(SkillsageError::ResponseTooLarge(format!(
                "技能目录内容超过 {} MiB",
                MAX_REMOTE_SKILL_TOTAL_BYTES / 1024 / 1024
            )));
        }
        downloaded.push(file);
    }
    downloaded.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(downloaded)
}

fn relative_path(file: &str, actual_prefix: &str) -> String {
    file.strip_prefix(actual_prefix)
        .unwrap_or(file)
        .trim_start_matches('/')
        .to_string()
}
