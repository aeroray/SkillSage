use crate::error::SkillsageError;
use std::time::Duration;

use crate::core::limits::{MAX_REMOTE_JSON_BYTES, MAX_REMOTE_TEXT_BYTES};

use super::{detail, models::SkillDetail, search};

const BASE_URL: &str = "https://www.skills.sh";

#[derive(Clone)]
pub struct StoreClient {
    http: reqwest::Client,
}

impl StoreClient {
    pub fn new_with_proxy(proxy_url: Option<String>) -> Result<Self, SkillsageError> {
        let mut builder = reqwest::Client::builder()
            .user_agent(concat!("SkillSage/", env!("CARGO_PKG_VERSION")))
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
        let bytes = bounded_bytes(response, MAX_REMOTE_TEXT_BYTES, "skills.sh 文本").await?;
        String::from_utf8(bytes).map_err(|error| {
            SkillsageError::InvalidStoreData(format!("skills.sh 返回了非 UTF-8 内容: {error}"))
        })
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
        let bytes = bounded_bytes(response, MAX_REMOTE_JSON_BYTES, "skills.sh JSON").await?;
        serde_json::from_slice(&bytes).map_err(|error| {
            SkillsageError::InvalidStoreData(format!("skills.sh 返回的数据无法解析: {error}"))
        })
    }

    pub(crate) fn detail_path(skill_id: &str) -> Result<String, SkillsageError> {
        validate_skill_id(skill_id)?;
        Ok(format!("/{skill_id}"))
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
