use crate::core::github::{
    client::GitHubClient,
    download::{fetch_skill_files, fetch_skill_files_with_probe, SkillProbe},
};
use crate::core::repo::lockfile::SkillLockRecord;
use crate::core::store::models::SkillFile;
use crate::core::{repo::layout::RepoLayout, settings};
use crate::error::SkillsageError;

pub async fn fetch_latest(
    record: &SkillLockRecord,
) -> Result<(String, Vec<SkillFile>), SkillsageError> {
    let runtime = settings::load_runtime(&RepoLayout::from_user_home()?)?;
    let client = GitHubClient::new_with_config(runtime.github_token, runtime.proxy_url)?;
    fetch_latest_with_client(&client, record).await
}

pub async fn fetch_latest_with_client(
    client: &GitHubClient,
    record: &SkillLockRecord,
) -> Result<(String, Vec<SkillFile>), SkillsageError> {
    let commit = client
        .get_latest_commit_sha(&record.owner, &record.repo)
        .await?;
    let files = fetch_at_commit(record, client, &commit).await?;
    Ok((commit, files))
}

pub async fn fetch_with_probe_at(
    client: &GitHubClient,
    record: &SkillLockRecord,
    commit: &str,
    local_skill_md: &str,
) -> Result<SkillProbe, SkillsageError> {
    let skill_path = record.skill_path.as_deref().unwrap_or(&record.name);
    fetch_skill_files_with_probe(
        client,
        &record.owner,
        &record.repo,
        commit,
        skill_path,
        local_skill_md,
    )
    .await
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

/// True when a record's source points at a supported remote host, so update
/// checks and updates can reconstruct it. Host-based rather than a prefix list
/// so every URL shape the installer and the sync importer accept is also
/// updateable — `raw.githubusercontent.com` installs in particular used to be
/// recorded but then silently reported as "no update available".
pub fn is_remote_record(record: &SkillLockRecord) -> bool {
    let Ok(url) = url::Url::parse(&record.source) else {
        return false;
    };
    url.scheme() == "https"
        && matches!(
            url.host_str(),
            Some("skills.sh")
                | Some("www.skills.sh")
                | Some("github.com")
                | Some("www.github.com")
                | Some("raw.githubusercontent.com")
        )
}
