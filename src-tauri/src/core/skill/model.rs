use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillManifest {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub compatibility: Option<String>,
    #[serde(default)]
    pub metadata: BTreeMap<String, serde_yaml::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct ParsedSkill {
    pub manifest: SkillManifest,
    pub body: String,
}
