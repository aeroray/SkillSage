use serde::de::DeserializeOwned;

use crate::error::SkillsageError;

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
        let mut builder = reqwest::Client::builder().user_agent("SkillSage/0.1");
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
        let url =
            format!("https://api.github.com/repos/{owner}/{repo}/git/trees/{commit}?recursive=1");
        self.get_json(&url).await
    }

    pub async fn get_text(&self, url: &str) -> Result<String, SkillsageError> {
        let response = self.authorized(self.http.get(url)).send().await?;
        if !response.status().is_success() {
            return Err(SkillsageError::GithubApi(response.status().as_u16()));
        }
        Ok(response.text().await?)
    }

    pub async fn get_default_branch(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<String, SkillsageError> {
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
        let url = format!("https://api.github.com/repos/{owner}/{repo}/commits/{reference}");
        let response: GitHubCommit = self.get_json(&url).await?;
        Ok(response.sha)
    }

    async fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T, SkillsageError> {
        let response = self.authorized(self.http.get(url)).send().await?;
        if !response.status().is_success() {
            return Err(SkillsageError::GithubApi(response.status().as_u16()));
        }
        Ok(response.json().await?)
    }

    fn authorized(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.token {
            Some(token) => request.bearer_auth(token),
            None => request,
        }
    }
}
