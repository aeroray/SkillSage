use crate::core::github::{client::GitHubClient, download::fetch_skill_files};
use crate::core::repo::lockfile::SkillLockRecord;
use crate::core::store::models::SkillFile;
use crate::core::{repo::layout::RepoLayout, settings};
use crate::error::SkillsageError;

pub async fn fetch_latest(
    record: &SkillLockRecord,
) -> Result<(String, Vec<SkillFile>), SkillsageError> {
    let runtime = settings::load_runtime(&RepoLayout::from_user_home()?)?;
    let client = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    let branch = client
        .get_default_branch(&record.owner, &record.repo)
        .await?;
    let commit = client
        .get_commit_sha(&record.owner, &record.repo, &branch)
        .await?;
    let files = fetch_at_commit(record, &client, &commit).await?;
    Ok((commit, files))
}

pub async fn fetch_at(
    record: &SkillLockRecord,
    commit: &str,
) -> Result<Vec<SkillFile>, SkillsageError> {
    let runtime = settings::load_runtime(&RepoLayout::from_user_home()?)?;
    let client = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    fetch_at_commit(record, &client, commit).await
}

async fn fetch_at_commit(
    record: &SkillLockRecord,
    client: &GitHubClient,
    commit: &str,
) -> Result<Vec<SkillFile>, SkillsageError> {
    if commit.is_empty()
        || !commit.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(SkillsageError::InvalidStoreData(
            "remote version contains unsafe characters".into(),
        ));
    }
    if record.owner.is_empty()
        || record.repo.is_empty()
        || record.owner.contains('/')
        || record.repo.contains('/')
    {
        return Err(SkillsageError::InvalidSkill(
            "skill source is not a valid GitHub repository".into(),
        ));
    }
    let skill_path = record.skill_path.as_deref().unwrap_or(&record.name);
    fetch_skill_files(client, &record.owner, &record.repo, commit, skill_path).await
}

pub fn is_remote_record(record: &SkillLockRecord) -> bool {
    record.source.starts_with("https://www.skills.sh/")
        || record.source.starts_with("https://github.com/")
}
