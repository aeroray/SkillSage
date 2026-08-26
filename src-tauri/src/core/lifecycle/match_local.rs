use crate::core::github::client::GitHubClient;
use crate::core::lifecycle::remote;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::store::{client::StoreClient, models::SkillSearchResult};
use crate::error::SkillsageError;
use serde::Serialize;
use std::sync::Arc;

const MAX_CANDIDATES_TO_VERIFY: usize = 20;
const MAX_CONCURRENT_VERIFICATIONS: usize = 4;
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillMatch {
    #[serde(flatten)]
    pub candidate: SkillSearchResult,
    pub verification: String,
    pub remote_version: Option<String>,
    pub remote_hash: Option<String>,
}

pub async fn search(
    store_client: &StoreClient,
    github_client: &GitHubClient,
    name: &str,
    local_hash: &str,
    local_skill_md: &str,
) -> Result<Vec<LocalSkillMatch>, SkillsageError> {
    let mut candidates = search_candidates(store_client, name)
        .await?
        .into_iter()
        .take(MAX_CANDIDATES_TO_VERIFY);
    let mut matches = Vec::new();
    let Some(first) = candidates.next() else {
        return Ok(matches);
    };
    let first = verify_candidate(github_client, first, local_hash, local_skill_md).await;
    let first_should_stop = matches!(first.verification.as_str(), "exact" | "rate-limited");
    matches.push(first);
    if first_should_stop {
        return Ok(matches);
    }

    for batch in candidates
        .collect::<Vec<_>>()
        .chunks(MAX_CONCURRENT_VERIFICATIONS)
    {
        let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_VERIFICATIONS));
        let mut jobs = tokio::task::JoinSet::new();
        for candidate in batch {
            let github_client = github_client.clone();
            let local_hash = local_hash.to_string();
            let local_skill_md = local_skill_md.to_string();
            let candidate = candidate.clone();
            let semaphore = semaphore.clone();
            jobs.spawn(async move {
                let _permit = semaphore
                    .acquire_owned()
                    .await
                    .map_err(|error| SkillsageError::Task(error.to_string()))?;
                Ok::<LocalSkillMatch, SkillsageError>(
                    verify_candidate(&github_client, candidate, &local_hash, &local_skill_md).await,
                )
            });
        }

        let mut batch_matches = Vec::with_capacity(batch.len());
        while let Some(result) = jobs.join_next().await {
            if let Ok(Ok(candidate)) = result {
                batch_matches.push(candidate);
            }
        }
        let has_exact = batch_matches
            .iter()
            .any(|candidate| candidate.verification == "exact");
        let has_rate_limit = batch_matches
            .iter()
            .any(|candidate| candidate.verification == "rate-limited");
        matches.extend(batch_matches);
        if has_exact || has_rate_limit {
            break;
        }
    }
    matches.sort_by(|left, right| {
        verification_rank(&left.verification)
            .cmp(&verification_rank(&right.verification))
            .then_with(|| right.candidate.installs.cmp(&left.candidate.installs))
            .then_with(|| left.candidate.id.cmp(&right.candidate.id))
    });
    Ok(matches)
}

async fn search_candidates(
    client: &StoreClient,
    name: &str,
) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let candidates = client.search(name).await?;
    let mut candidates = candidates
        .into_iter()
        .filter(|candidate| is_name_match(name, candidate) && validate_candidate(candidate).is_ok())
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .installs
            .cmp(&left.installs)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(candidates)
}

async fn verify_candidate(
    github_client: &GitHubClient,
    candidate: SkillSearchResult,
    local_hash: &str,
    local_skill_md: &str,
) -> LocalSkillMatch {
    let verification = match repository_parts(&candidate.source) {
        Ok((owner, repo)) => {
            let probe = lockfile::SkillLockRecord {
                id: candidate.id.clone(),
                name: candidate.name.clone(),
                owner: owner.to_string(),
                repo: repo.to_string(),
                skill_path: Some(candidate.slug.clone()),
                source: candidate.url.clone(),
                current_version: String::new(),
                current_hash: local_hash.to_string(),
                installed_at: String::new(),
                version_history: Vec::new(),
                description: String::new(),
                claude_distributed: false,
            };
            match remote::fetch_latest_with_probe(github_client, &probe, local_skill_md).await {
                Ok((version, Some(files))) => {
                    let remote_hash = lockfile::content_hash_files(
                        &files
                            .iter()
                            .map(|file| (file.path.replace('\\', "/"), file.contents.clone()))
                            .collect::<Vec<_>>(),
                    );
                    let content_match = remote_hash == local_hash;
                    (
                        if content_match { "exact" } else { "different" },
                        Some(version),
                        Some(remote_hash),
                    )
                }
                Ok((version, None)) => ("different", Some(version), None),
                Err(error) => (verification_for_error(&error), None, None),
            }
        }
        Err(_) => ("unavailable", None, None),
    };

    LocalSkillMatch {
        candidate,
        verification: verification.0.to_string(),
        remote_version: verification.1,
        remote_hash: verification.2,
    }
}

fn verification_for_error(error: &SkillsageError) -> &'static str {
    match error {
        SkillsageError::RateLimited => "rate-limited",
        SkillsageError::GithubAuthMissing | SkillsageError::GithubAuthInvalid => "auth-required",
        SkillsageError::RepositoryNotFound => "not-found",
        SkillsageError::PathNotFound(_) => "path-not-found",
        SkillsageError::ResponseTooLarge(_) => "too-large",
        SkillsageError::Network(_) => "network-error",
        _ => "unavailable",
    }
}

fn verification_rank(value: &str) -> u8 {
    match value {
        "exact" => 0,
        "different" => 1,
        _ => 2,
    }
}

pub async fn find(
    client: &StoreClient,
    name: &str,
    remote_skill_id: &str,
) -> Result<SkillSearchResult, SkillsageError> {
    search_candidates(client, name)
        .await?
        .into_iter()
        .find(|candidate| candidate.id == remote_skill_id)
        .ok_or_else(|| {
            SkillsageError::InvalidSkill("所选远端技能与本地名称不匹配，请重新搜索".into())
        })
}

pub fn link_at(
    layout: &RepoLayout,
    local_skill_id: &str,
    candidate: &SkillSearchResult,
    remote_version: Option<&str>,
) -> Result<lockfile::SkillLockRecord, SkillsageError> {
    validate_candidate(candidate)?;
    let (owner, repo) = repository_parts(&candidate.source)?;
    let mut lock = lockfile::load(layout)?;
    let current = lock
        .skills
        .get(local_skill_id)
        .cloned()
        .ok_or_else(|| SkillsageError::NotInstalled(local_skill_id.to_string()))?;
    if !current.source.starts_with("local://") {
        return Err(SkillsageError::InvalidSkill(
            "只有本地来源技能可以进行在线匹配".into(),
        ));
    }
    if !is_name_match(&current.name, candidate) {
        return Err(SkillsageError::InvalidSkill(
            "远端技能名称与本地技能不匹配".into(),
        ));
    }

    let destination = layout.skill(&current.name)?;
    ensure_real_skill_directory(&destination)?;
    let current_hash = lockfile::content_hash(&destination)?;
    if lock
        .skills
        .keys()
        .any(|id| id == &candidate.id && id != local_skill_id)
    {
        return Err(SkillsageError::AlreadyInstalled(candidate.id.clone()));
    }

    let mut next = current;
    next.id = candidate.id.clone();
    next.owner = owner.to_string();
    next.repo = repo.to_string();
    next.skill_path = Some(candidate.slug.clone());
    next.source = format!("https://www.skills.sh/{}", candidate.id);
    next.current_version = remote_version
        .filter(|version| !version.is_empty())
        .unwrap_or("unverified")
        .to_string();
    next.current_hash = current_hash;
    lock.skills.remove(local_skill_id);
    lock.skills.insert(next.id.clone(), next.clone());
    lockfile::save(layout, &lock)?;
    Ok(next)
}

fn is_name_match(name: &str, candidate: &SkillSearchResult) -> bool {
    let normalized = name.trim();
    candidate.name.eq_ignore_ascii_case(normalized)
        || candidate.slug.eq_ignore_ascii_case(normalized)
        || candidate
            .id
            .rsplit('/')
            .next()
            .is_some_and(|leaf| leaf.eq_ignore_ascii_case(normalized))
}

fn validate_candidate(candidate: &SkillSearchResult) -> Result<(), SkillsageError> {
    if candidate.id.is_empty() || candidate.slug.is_empty() {
        return Err(SkillsageError::InvalidStoreData(
            "远端技能匹配结果缺少技能路径".into(),
        ));
    }
    StoreClient::detail_path(&candidate.id)?;
    repository_parts(&candidate.source)?;
    validate_skill_path(&candidate.slug)
}

fn repository_parts(source: &str) -> Result<(&str, &str), SkillsageError> {
    let mut parts = source.split('/');
    let owner = parts.next().unwrap_or_default();
    let repo = parts.next().unwrap_or_default();
    if owner.is_empty()
        || repo.is_empty()
        || parts.next().is_some()
        || !is_safe_component(owner)
        || !is_safe_component(repo)
    {
        return Err(SkillsageError::InvalidSkill(
            "远端技能来源不是有效的 GitHub 仓库".into(),
        ));
    }
    Ok((owner, repo))
}

fn validate_skill_path(value: &str) -> Result<(), SkillsageError> {
    let normalized = value.trim_matches('/');
    if normalized.is_empty()
        || value.contains('\\')
        || normalized
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(SkillsageError::InvalidSkill(
            "远端技能路径包含不安全片段".into(),
        ));
    }
    Ok(())
}

fn is_safe_component(value: &str) -> bool {
    value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
}

fn ensure_real_skill_directory(path: &std::path::Path) -> Result<(), SkillsageError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(()),
        Ok(_) => Err(SkillsageError::Io(format!(
            "本地技能目录不是受 SkillSage 管理的真实目录: {}",
            path.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err(SkillsageError::PathNotFound(path.to_path_buf()))
        }
        Err(error) => Err(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::{is_name_match, link_at, verification_for_error, verification_rank};
    use crate::core::lifecycle::install::{install_test_skill_at, TEST_SKILL_ID};
    use crate::core::repo::{layout::RepoLayout, lockfile};
    use crate::core::store::models::SkillSearchResult;
    use crate::error::SkillsageError;
    use std::fs;

    fn candidate() -> SkillSearchResult {
        SkillSearchResult {
            id: "owner/repo/skillsage-phase2-test".into(),
            slug: "skillsage-phase2-test".into(),
            name: "skillsage-phase2-test".into(),
            source: "owner/repo".into(),
            installs: 0,
            source_type: "github".into(),
            install_url: None,
            url: "https://www.skills.sh/owner/repo/skillsage-phase2-test".into(),
            is_duplicate: false,
        }
    }

    #[test]
    fn matches_name_or_skill_path_case_insensitively() {
        let candidate = candidate();
        assert!(is_name_match("skillsage-phase2-test", &candidate));
        assert!(!is_name_match("other-skill", &candidate));
    }

    #[test]
    fn ranks_exact_content_before_unverified_candidates() {
        assert!(verification_rank("exact") < verification_rank("different"));
        assert!(verification_rank("different") < verification_rank("unavailable"));
    }

    #[test]
    fn classifies_verification_failures_without_calling_them_content_matches() {
        assert_eq!(
            verification_for_error(&SkillsageError::RateLimited),
            "rate-limited"
        );
        assert_eq!(
            verification_for_error(&SkillsageError::PathNotFound("SKILL.md".into())),
            "path-not-found"
        );
        assert_eq!(
            verification_for_error(&SkillsageError::Network("timeout".into())),
            "network-error"
        );
        assert_ne!(
            verification_for_error(&SkillsageError::RateLimited),
            "exact"
        );
    }

    #[test]
    fn links_a_local_record_to_a_remote_candidate() {
        let root =
            std::env::temp_dir().join(format!("skillsage-local-match-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create shared test parent");
        let layout = RepoLayout::new(root.join("central"), root.join("public"));
        install_test_skill_at(&layout).expect("fixture should install");
        let mut lock = lockfile::load(&layout).expect("lock should load");
        lock.skills
            .get_mut(TEST_SKILL_ID)
            .expect("fixture should be tracked")
            .source = "local://skillsage-phase2-test".into();
        lockfile::save(&layout, &lock).expect("local fixture should save");

        let linked = link_at(
            &layout,
            TEST_SKILL_ID,
            &candidate(),
            Some("remote-commit-123"),
        )
        .expect("match should link");
        assert_eq!(linked.id, "owner/repo/skillsage-phase2-test");
        assert_eq!(linked.current_version, "remote-commit-123");
        assert!(linked.source.starts_with("https://www.skills.sh/"));
        assert_eq!(
            lockfile::load(&layout)
                .expect("lock should load")
                .skills
                .len(),
            1
        );

        fs::remove_dir_all(root).expect("remove test root");
    }
}
