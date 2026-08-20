use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::error::SkillsageError;

use super::super::limits::{MAX_REMOTE_JSON_BYTES, MAX_REMOTE_TEXT_BYTES};
use super::tree::GitTreeResponse;

#[derive(Debug, serde::Deserialize)]
struct GitHubRepository {
    default_branch: String,
}

#[derive(Debug, serde::Deserialize)]
struct GitHubCommit {
    sha: String,
}

#[derive(Clone)]
pub struct GitHubClient {
    http: reqwest::Client,
    token: Option<String>,
}

impl GitHubClient {
    pub fn new(token: Option<String>) -> Result<Self, SkillsageError> {
        Self::new_with_config(token, None)
    }

    pub fn new_with_config(
        token: Option<String>,
        proxy_url: Option<String>,
    ) -> Result<Self, SkillsageError> {
        let mut builder = reqwest::Client::builder()
            .user_agent("SkillSage/0.1")
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(45));
        if let Some(proxy_url) = proxy_url {
            builder = builder.proxy(reqwest::Proxy::all(proxy_url)?);
        }
        let http = builder.build()?;
        Ok(Self { http, token })
    }

    pub async fn get_tree(
        &self,
        owner: &str,
        repo: &str,
        commit: &str,
    ) -> Result<GitTreeResponse, SkillsageError> {
        validate_component(owner, "owner")?;
        validate_component(repo, "repository")?;
        validate_reference(commit)?;
        let url =
            format!("https://api.github.com/repos/{owner}/{repo}/git/trees/{commit}?recursive=1");
        self.get_json(&url).await
    }

    pub async fn get_text(&self, url: &str) -> Result<String, SkillsageError> {
        let response = self
            .authorized(self.http.get(url))
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(error = %error, "GitHub request failed");
                SkillsageError::from(error)
            })?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            tracing::warn!(status, "GitHub request returned an error status");
            return Err(SkillsageError::github_status(status, self.token.is_some()));
        }
        let bytes = bounded_bytes(response, MAX_REMOTE_TEXT_BYTES, "GitHub 文本").await?;
        String::from_utf8(bytes).map_err(|error| {
            SkillsageError::InvalidStoreData(format!("GitHub 返回了非 UTF-8 内容: {error}"))
        })
    }

    pub async fn get_default_branch(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<String, SkillsageError> {
        validate_component(owner, "owner")?;
        validate_component(repo, "repository")?;
        let url = format!("https://api.github.com/repos/{owner}/{repo}");
        let response: GitHubRepository = self.get_json(&url).await?;
        Ok(response.default_branch)
    }

    pub async fn get_commit_sha(
        &self,
        owner: &str,
        repo: &str,
        reference: &str,
    ) -> Result<String, SkillsageError> {
        validate_component(owner, "owner")?;
        validate_component(repo, "repository")?;
        validate_reference(reference)?;
        let url = format!("https://api.github.com/repos/{owner}/{repo}/commits/{reference}");
        let response: GitHubCommit = self.get_json(&url).await?;
        Ok(response.sha)
    }

    async fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T, SkillsageError> {
        let response = self
            .authorized(self.http.get(url))
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(error = %error, "GitHub request failed");
                SkillsageError::from(error)
            })?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            tracing::warn!(status, "GitHub request returned an error status");
            return Err(SkillsageError::github_status(status, self.token.is_some()));
        }
        let bytes = bounded_bytes(response, MAX_REMOTE_JSON_BYTES, "GitHub JSON").await?;
        serde_json::from_slice(&bytes).map_err(|error| {
            SkillsageError::InvalidStoreData(format!("GitHub 返回的数据无法解析: {error}"))
        })
    }

    fn authorized(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.token {
            Some(token) => request.bearer_auth(token),
            None => request,
        }
    }
}

async fn bounded_bytes(
    response: reqwest::Response,
    limit: usize,
    label: &str,
) -> Result<Vec<u8>, SkillsageError> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(SkillsageError::ResponseTooLarge(format!(
            "{label}超过 {} MiB",
            limit / 1024 / 1024
        )));
    }
    let bytes = response.bytes().await?;
    if bytes.len() > limit {
        return Err(SkillsageError::ResponseTooLarge(format!(
            "{label}超过 {} MiB",
            limit / 1024 / 1024
        )));
    }
    Ok(bytes.to_vec())
}

fn validate_component(value: &str, label: &str) -> Result<(), SkillsageError> {
    if value.is_empty()
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(SkillsageError::InvalidGithubUrl(format!(
            "{label} 包含不安全字符"
        )));
    }
    Ok(())
}

fn validate_reference(value: &str) -> Result<(), SkillsageError> {
    if value.is_empty()
        || value.len() > 512
        || value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '/')
        })
    {
        return Err(SkillsageError::InvalidGithubUrl(
            "分支或 commit 包含不安全字符".into(),
        ));
    }
    Ok(())
}
