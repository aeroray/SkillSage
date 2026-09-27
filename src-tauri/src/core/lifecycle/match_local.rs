use crate::core::github::client::GitHubClient;
use crate::core::lifecycle::remote;
use crate::core::repo::{layout::RepoLayout, lockfile};
use crate::core::skill::parser::parse_skill_md;
use crate::core::store::{client::StoreClient, models::SkillSearchResult};
use crate::error::SkillsageError;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;

const MAX_CANDIDATES_TO_VERIFY: usize = 20;
const DEFAULT_CANDIDATES_TO_VERIFY: usize = 3;
const MAX_CONCURRENT_VERIFICATIONS: usize = 4;

#[derive(Debug, Clone)]
pub struct PreferredRemote {
    pub owner: String,
    pub repo: String,
    pub skill_path: Option<String>,
    pub source_url: String,
}

impl PreferredRemote {
    pub fn into_candidate(self, name: &str) -> SkillSearchResult {
        let slug = self.skill_path.unwrap_or_else(|| name.to_string());
        SkillSearchResult {
            id: format!("{}/{}/{}", self.owner, self.repo, name),
            slug,
            name: name.to_string(),
            source: format!("{}/{}", self.owner, self.repo),
            installs: 0,
            source_type: "github".to_string(),
            description: None,
            install_url: Some(self.source_url.clone()),
            url: self.source_url,
            is_duplicate: false,
        }
    }
}

pub struct SearchRequest<'a> {
    pub name: &'a str,
    pub local_hash: &'a str,
    pub local_skill_md: &'a str,
    pub preferred: Option<PreferredRemote>,
    pub exhaustive: bool,
    pub cached_candidates: Option<Vec<SkillSearchResult>>,
    pub prior_matches: Vec<LocalSkillMatch>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillMatch {
    #[serde(flatten)]
    pub candidate: SkillSearchResult,
    pub verification: String,
    pub remote_version: Option<String>,
    pub remote_hash: Option<String>,
    pub description_match: bool,
    pub match_basis: String,
}

pub async fn search(
    store_client: &StoreClient,
    github_client: &GitHubClient,
    request: SearchRequest<'_>,
) -> Result<(Vec<LocalSkillMatch>, Vec<SkillSearchResult>), SkillsageError> {
    let SearchRequest {
        name,
        local_hash,
        local_skill_md,
        preferred,
        exhaustive,
        cached_candidates,
        prior_matches,
    } = request;
    if let Some(preferred) = preferred {
        let candidate = verify_candidate(
            github_client,
            preferred.into_candidate(name),
            local_hash,
            local_skill_md,
            "npx-lock",
        )
        .await;
        if matches!(
            candidate.verification.as_str(),
            "exact" | "different" | "rate-limited"
        ) {
            return Ok((vec![candidate], Vec::new()));
        }
    }

    let limit = if exhaustive {
        MAX_CANDIDATES_TO_VERIFY
    } else {
        DEFAULT_CANDIDATES_TO_VERIFY
    };
    let candidates = match cached_candidates {
        Some(candidates) => candidates,
        None => search_candidates(store_client, name).await?,
    };
    let dominant_first =
        candidates
            .first()
            .zip(candidates.get(1))
            .is_some_and(|(first, second)| {
                first.installs >= 10_000 && first.installs >= second.installs.saturating_mul(5)
            });
    let prior_ids = prior_matches
        .iter()
        .map(|candidate| candidate.candidate.id.as_str())
        .collect::<HashSet<_>>();
    let mut pending = candidates
        .iter()
        .take(limit)
        .filter(|candidate| !prior_ids.contains(candidate.id.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    let mut matches = prior_matches;

    if matches.is_empty() && !pending.is_empty() {
        let first = verify_candidate(
            github_client,
            pending.remove(0),
            local_hash,
            local_skill_md,
            "store-search",
        )
        .await;
        let first_should_stop = matches!(first.verification.as_str(), "exact" | "rate-limited")
            || (!exhaustive && first.description_match && dominant_first);
        matches.push(first);
        if first_should_stop {
            return Ok((matches, candidates));
        }
    }

    for batch in pending.chunks(MAX_CONCURRENT_VERIFICATIONS) {
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
                    verify_candidate(
                        &github_client,
                        candidate,
                        &local_hash,
                        &local_skill_md,
                        "store-search",
                    )
                    .await,
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
            .then_with(|| right.description_match.cmp(&left.description_match))
            .then_with(|| right.candidate.installs.cmp(&left.candidate.installs))
            .then_with(|| left.candidate.id.cmp(&right.candidate.id))
    });
    Ok((matches, candidates))
}

async fn search_candidates(
    client: &StoreClient,
    name: &str,
) -> Result<Vec<SkillSearchResult>, SkillsageError> {
    let candidates = client.search(name).await?;
    Ok(prepare_candidates(name, candidates))
}

fn prepare_candidates(name: &str, candidates: Vec<SkillSearchResult>) -> Vec<SkillSearchResult> {
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
    let mut seen = HashSet::new();
    candidates.retain(|candidate| seen.insert((candidate.source.clone(), candidate.slug.clone())));
    candidates
}

async fn verify_candidate(
    github_client: &GitHubClient,
    mut candidate: SkillSearchResult,
    local_hash: &str,
    local_skill_md: &str,
    match_basis: &str,
) -> LocalSkillMatch {
    let mut description_match = false;
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
                description: String::new(),
                distributed_to: Vec::new(),
            };
            match github_client.get_latest_commit_sha(owner, repo).await {
                Ok(version) => match remote::fetch_with_probe_at(
                    github_client,
                    &probe,
                    &version,
                    local_skill_md,
                )
                .await
                {
                    Ok(probe) => {
                        if let Ok(parsed) = parse_skill_md(&probe.skill_md) {
                            description_match =
                                descriptions_match(local_skill_md, &parsed.manifest.description);
                            if candidate.description.is_none() {
                                candidate.description = Some(parsed.manifest.description);
                            }
                        }
                        let Some(files) = probe.files else {
                            return LocalSkillMatch {
                                candidate,
                                verification: "different".to_string(),
                                remote_version: Some(version),
                                remote_hash: None,
                                description_match,
                                match_basis: match_basis.to_string(),
                            };
                        };
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
                    Err(error) => (verification_for_error(&error), Some(version), None),
                },
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
        description_match,
        match_basis: match_basis.to_string(),
    }
}

fn descriptions_match(local_skill_md: &str, remote_description: &str) -> bool {
    let Ok(local) = parse_skill_md(local_skill_md) else {
        return false;
    };
    let local = normalize_description(&local.manifest.description);
    let remote = normalize_description(remote_description);
    local.chars().count() >= 16 && local == remote
}

fn normalize_description(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .filter(|character| character.is_alphanumeric())
        .collect()
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

/// Links a local record to a remote candidate.
///
/// `verification` is the candidate's verification result from `search`. A
/// version is only recorded when the candidate's content was confirmed
/// byte-identical (`"exact"`); binding a commit to content that was explicitly
/// found to differ would make the record claim the local directory *is* that
/// revision, and a later update check would compare against the wrong bytes.
pub fn link_at(
    layout: &RepoLayout,
    local_skill_id: &str,
    candidate: &SkillSearchResult,
    remote_version: Option<&str>,
    verification: &str,
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
    next.source = if candidate.url.starts_with("https://github.com/") {
        candidate.url.clone()
    } else {
        format!("https://www.skills.sh/{}", candidate.id)
    };
    next.current_version = remote_version
        .filter(|version| !version.is_empty())
        .filter(|_| verification == "exact")
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
    use super::{
        descriptions_match, is_name_match, link_at, prepare_candidates, verification_for_error,
        verification_rank, PreferredRemote,
    };
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
            description: None,
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
    fn matches_only_substantial_normalized_descriptions() {
        let local = "---\nname: sample\ndescription: Helps users inspect and improve existing projects.\n---\n";
        assert!(descriptions_match(
            local,
            "Helps users inspect, and improve existing projects!"
        ));
        assert!(!descriptions_match(local, "A different description."));
        let short = "---\nname: sample\ndescription: Helper.\n---\n";
        assert!(!descriptions_match(short, "Helper"));
    }

    #[test]
    fn builds_a_direct_candidate_from_an_npx_source_hint() {
        let candidate = PreferredRemote {
            owner: "obra".into(),
            repo: "superpowers".into(),
            skill_path: Some("skills/brainstorming".into()),
            source_url: "https://github.com/obra/superpowers".into(),
        }
        .into_candidate("brainstorming");
        assert_eq!(candidate.id, "obra/superpowers/brainstorming");
        assert_eq!(candidate.slug, "skills/brainstorming");
        assert_eq!(candidate.source, "obra/superpowers");
    }

    #[test]
    fn deduplicates_candidates_and_sorts_by_install_count() {
        let mut popular = candidate();
        popular.id = "popular/repo/skillsage-phase2-test".into();
        popular.source = "popular/repo".into();
        popular.installs = 100_000;
        let mut duplicate = popular.clone();
        duplicate.id = "duplicate-id-for-the-same-source-and-path".into();
        duplicate.installs = 5;
        let mut niche = candidate();
        niche.installs = 10;

        let prepared = prepare_candidates(
            "skillsage-phase2-test",
            vec![niche, duplicate, popular.clone()],
        );
        assert_eq!(prepared.len(), 2);
        assert_eq!(prepared[0].source, popular.source);
        assert_eq!(prepared[0].installs, 100_000);
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
            "exact",
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

    #[test]
    fn does_not_bind_a_version_to_content_that_was_not_verified_exact() {
        let root = std::env::temp_dir().join(format!(
            "skillsage-local-match-unverified-{}",
            std::process::id()
        ));
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

        // The candidate's content was found to differ, so recording its commit
        // would claim the local directory is that revision.
        let linked = link_at(
            &layout,
            TEST_SKILL_ID,
            &candidate(),
            Some("remote-commit-123"),
            "different",
        )
        .expect("match should still link");
        assert_eq!(linked.current_version, "unverified");

        fs::remove_dir_all(root).expect("remove test root");
    }
}
