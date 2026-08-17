use serde::de::DeserializeOwned;

use crate::error::SkillsageError;

use super::tree::GitTreeResponse;

#[derive(Clone)]
pub struct GitHubClient {
    http: reqwest::Client,
    token: Option<String>,
}

impl GitHubClient {
    pub fn new(token: Option<String>) -> Result<Self, SkillsageError> {
        let http = reqwest::Client::builder()
            .user_agent("SkillSage/0.1")
            .build()?;
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
