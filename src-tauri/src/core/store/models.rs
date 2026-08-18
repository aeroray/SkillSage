use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSearchResult {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub source: String,
    pub installs: u64,
    pub source_type: String,
    #[serde(default)]
    pub install_url: Option<String>,
    pub url: String,
    #[serde(default)]
    pub is_duplicate: bool,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LeaderboardRange {
    AllTime,
    Trending,
    Hot,
}

impl LeaderboardRange {
    pub fn path(self) -> &'static str {
        match self {
            Self::AllTime => "/",
            Self::Trending => "/trending",
            Self::Hot => "/hot",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub provider: String,
    pub slug: String,
    pub status: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub audited_at: Option<String>,
    #[serde(default)]
    pub risk_level: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFile {
    pub path: String,
    pub contents: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetail {
    pub id: String,
    pub source: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub license: Option<String>,
    pub installs: u64,
    #[serde(default)]
    pub github_stars: Option<u64>,
    pub url: String,
    pub audits: Vec<AuditEntry>,
    #[serde(default, skip_serializing)]
    pub version: Option<String>,
    #[serde(skip_serializing)]
    pub files: Vec<SkillFile>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct LegacySearchResponse {
    #[serde(default)]
    pub skills: Vec<LegacySearchItem>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct LegacySearchItem {
    pub id: String,
    #[serde(rename = "skillId")]
    pub skill_id: String,
    pub name: String,
    pub installs: u64,
    pub source: String,
}
