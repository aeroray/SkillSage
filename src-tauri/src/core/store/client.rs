use crate::error::SkillsageError;
use std::time::Duration;

use super::{detail, models::SkillDetail, search};

const BASE_URL: &str = "https://www.skills.sh";

#[derive(Clone)]
pub struct StoreClient {
    http: reqwest::Client,
}

impl StoreClient {
    pub fn new_with_proxy(proxy_url: Option<String>) -> Result<Self, SkillsageError> {
        let mut builder = reqwest::Client::builder()
            .user_agent("SkillSage/0.1")
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30));
        if let Some(proxy_url) = proxy_url {
            builder = builder.proxy(reqwest::Proxy::all(proxy_url)?);
        }
        let http = builder.build()?;
        Ok(Self { http })
    }

    pub async fn search(
        &self,
        query: &str,
    ) -> Result<Vec<super::models::SkillSearchResult>, SkillsageError> {
        search::fetch(self, query).await
    }

    pub async fn leaderboard(
        &self,
        range: super::models::LeaderboardRange,
    ) -> Result<Vec<super::models::SkillSearchResult>, SkillsageError> {
        search::fetch_leaderboard(self, range).await
    }

    pub async fn detail(&self, skill_id: &str) -> Result<SkillDetail, SkillsageError> {
        detail::fetch(self, skill_id).await
    }

    pub(crate) async fn get_text(&self, path: &str) -> Result<String, SkillsageError> {
        let response = self
            .http
            .get(format!("{BASE_URL}{path}"))
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(error = %error, "skills.sh request failed");
                SkillsageError::store_network(error)
            })?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            tracing::warn!(status, "skills.sh request returned an error status");
            return Err(SkillsageError::store_status(status));
        }
        Ok(response.text().await?)
    }

    pub(crate) async fn get_json<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, SkillsageError> {
        let response = self
            .http
            .get(format!("{BASE_URL}{path}"))
            .query(query)
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(error = %error, "skills.sh request failed");
                SkillsageError::store_network(error)
            })?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            tracing::warn!(status, "skills.sh request returned an error status");
            return Err(SkillsageError::store_status(status));
        }
        Ok(response.json().await?)
    }

    pub(crate) fn detail_path(skill_id: &str) -> Result<String, SkillsageError> {
        validate_skill_id(skill_id)?;
        Ok(format!("/{skill_id}"))
    }
}

fn validate_skill_id(skill_id: &str) -> Result<(), SkillsageError> {
    let valid = !skill_id.is_empty()
        && skill_id.split('/').all(|part| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && part.chars().all(|character| {
                    character.is_ascii_alphanumeric() || ".-_:".contains(character)
                })
        });
    if valid {
        Ok(())
    } else {
        Err(SkillsageError::InvalidStoreData(format!(
            "invalid skill id: {skill_id}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::StoreClient;

    #[test]
    fn validates_detail_paths_without_allowing_traversal() {
        assert_eq!(
            StoreClient::detail_path("vercel-labs/skills/find-skills").unwrap(),
            "/vercel-labs/skills/find-skills"
        );
        assert!(StoreClient::detail_path("../secret").is_err());
        assert!(StoreClient::detail_path("owner//skill").is_err());
    }
}
