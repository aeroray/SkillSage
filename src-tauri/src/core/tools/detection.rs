use serde::Serialize;

use crate::error::SkillsageError;

use super::registry::TOOLS;
use crate::core::paths;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTool {
    pub id: String,
    pub name: String,
    pub skills_path: String,
    pub detected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTools {
    pub tools: Vec<DetectedTool>,
}

pub fn detect_tools() -> Result<DetectedTools, SkillsageError> {
    let mut tools = Vec::with_capacity(TOOLS.len());
    for definition in TOOLS {
        let skills_path = definition.skills_path()?;
        tools.push(DetectedTool {
            id: definition.id.to_string(),
            name: definition.name.to_string(),
            detected: skills_path.is_dir(),
            skills_path: paths::display(&skills_path),
        });
    }
    Ok(DetectedTools { tools })
}
