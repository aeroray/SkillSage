use std::path::PathBuf;

use crate::error::SkillsageError;

#[derive(Debug, Clone, Copy)]
pub struct ToolDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub relative_skills_path: &'static str,
}

pub const TOOLS: [ToolDefinition; 5] = [
    ToolDefinition {
        id: "claude-code",
        name: "Claude Code",
        relative_skills_path: ".claude/skills",
    },
    ToolDefinition {
        id: "cursor",
        name: "Cursor",
        relative_skills_path: ".cursor/skills",
    },
    ToolDefinition {
        id: "github-copilot",
        name: "GitHub Copilot",
        relative_skills_path: ".github/skills",
    },
    ToolDefinition {
        id: "codex",
        name: "OpenAI Codex CLI",
        relative_skills_path: ".codex/skills",
    },
    ToolDefinition {
        id: "opencode",
        name: "OpenCode",
        relative_skills_path: ".config/opencode/skills",
    },
];

impl ToolDefinition {
    pub fn skills_path(&self) -> Result<PathBuf, SkillsageError> {
        let home = dirs::home_dir().ok_or(SkillsageError::HomeDirectoryUnavailable)?;
        let relative_path = if cfg!(windows) {
            self.relative_skills_path.replace('/', "\\")
        } else {
            self.relative_skills_path.to_string()
        };
        Ok(home.join(relative_path))
    }
}

pub fn find_tool(id: &str) -> Result<ToolDefinition, SkillsageError> {
    TOOLS
        .iter()
        .copied()
        .find(|tool| tool.id == id)
        .ok_or_else(|| SkillsageError::UnknownTool(id.to_string()))
}

#[cfg(windows)]
#[test]
fn registry_paths_use_windows_separators() {
    for tool in TOOLS {
        let path = tool.skills_path().expect("path should resolve");
        assert!(!path.to_string_lossy().contains('/'));
    }
}
