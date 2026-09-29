//! The registry of AI tools that read Agent Skills, and the rules for reaching
//! each one.
//!
//! Every skill installs as real content into the single shared directory
//! (`~/.agents/skills/`). A tool that also reads that directory needs nothing
//! else. A tool that only reads its own directory needs a link, and that link
//! is the only per-tool artifact this app manages.
//!
//! Which category a tool falls into is a *declared property of the tool*, not a
//! guess: `reads_shared_default` records what the tool's documentation says,
//! and the user can override it in Settings because tools gain shared-directory
//! support over time.
//!
//! `source` carries the documentation the entry was taken from, so a wrong
//! entry can be checked rather than guessed at. `verified` is false when the
//! path came from a third-party installer table instead of vendor docs.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::SkillsageError;

/// One tool's static description. Paths are relative to the user's home
/// directory and use `/`, which Windows accepts as a separator.
#[derive(Debug, Clone, Copy)]
pub struct ToolSpec {
    /// Stable id; also the value stored in the lock file.
    pub id: &'static str,
    pub label: &'static str,
    /// Where this tool reads user-level skills from. `None` means the tool has
    /// no directory of its own — it reads the shared directory and nothing
    /// else — so there is nothing to distribute into.
    pub skills_dir: Option<&'static str>,
    /// What the tool's documentation says about the shared directory.
    pub reads_shared_default: bool,
    /// Documentation the entry came from.
    pub source: &'static str,
    /// True when `source` is the vendor's own documentation.
    pub verified: bool,
}

impl ToolSpec {
    /// A tool that reads the shared directory needs no link, and a tool with no
    /// directory of its own cannot accept one. Either way there is nothing to
    /// distribute.
    pub fn distributable(&self) -> bool {
        self.skills_dir.is_some()
    }
}

/// Registry order is the order Settings lists them: tools that need a link
/// first (most action-worthy), then tools that already read the shared
/// directory.
pub const TOOLS: &[ToolSpec] = &[
    // ---- Tools that read only their own directory, so they need a link ----
    ToolSpec {
        id: "claude-code",
        label: "Claude Code",
        skills_dir: Some(".claude/skills"),
        reads_shared_default: false,
        source: "https://code.claude.com/docs/en/skills",
        verified: true,
    },
    ToolSpec {
        id: "codebuddy",
        label: "CodeBuddy / WorkBuddy",
        skills_dir: Some(".codebuddy/skills"),
        reads_shared_default: false,
        source: "https://www.workbuddy.ai/docs/cli/skills",
        verified: true,
    },
    ToolSpec {
        id: "codex",
        label: "OpenAI Codex CLI",
        skills_dir: Some(".codex/skills"),
        reads_shared_default: false,
        // Was `https://cursor.com/docs/skills`, which documents *Cursor*. That
        // page does list `.codex/skills` as a directory Cursor reads for
        // compatibility, but it is not Codex's own documentation, and `source`
        // exists precisely so a wrong path can be checked against the page the
        // entry came from. The path came from the third-party table used by the
        // other unverified entries, so it points there now.
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "cline",
        label: "Cline",
        skills_dir: Some(".cline/skills"),
        reads_shared_default: false,
        source: "https://docs.cline.bot/customization/skills",
        verified: true,
    },
    ToolSpec {
        id: "kilo",
        label: "Kilo Code",
        skills_dir: Some(".kilo/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "kiro",
        label: "Kiro CLI",
        skills_dir: Some(".kiro/skills"),
        reads_shared_default: false,
        source: "https://kiro.dev/docs/skills",
        verified: true,
    },
    ToolSpec {
        id: "trae",
        label: "Trae",
        skills_dir: Some(".trae/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "trae-cn",
        label: "Trae CN",
        skills_dir: Some(".trae-cn/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "junie",
        label: "Junie (JetBrains)",
        skills_dir: Some(".junie/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "continue",
        label: "Continue",
        skills_dir: Some(".continue/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "goose",
        label: "Goose",
        skills_dir: Some(".config/goose/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "openhands",
        label: "OpenHands",
        skills_dir: Some(".openhands/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "qwen",
        label: "Qwen Code",
        skills_dir: Some(".qwen/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "qoder",
        label: "Qoder",
        skills_dir: Some(".qoder/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "qoder-cn",
        label: "Qoder CN",
        skills_dir: Some(".qoder-cn/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "hermes",
        label: "Hermes Agent",
        skills_dir: Some(".hermes/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "bob",
        label: "IBM Bob",
        skills_dir: Some(".bob/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "augment",
        label: "Augment",
        skills_dir: Some(".augment/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    ToolSpec {
        id: "openclaw",
        label: "OpenClaw",
        skills_dir: Some(".openclaw/skills"),
        reads_shared_default: false,
        source: "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts",
        verified: false,
    },
    // ---- Tools that already read the shared directory ----
    ToolSpec {
        id: "cursor",
        label: "Cursor",
        skills_dir: Some(".cursor/skills"),
        reads_shared_default: true,
        source: "https://cursor.com/docs/skills",
        verified: true,
    },
    ToolSpec {
        id: "copilot",
        label: "GitHub Copilot",
        skills_dir: Some(".copilot/skills"),
        reads_shared_default: true,
        source: "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills",
        verified: true,
    },
    ToolSpec {
        id: "opencode",
        label: "OpenCode",
        skills_dir: Some(".config/opencode/skills"),
        reads_shared_default: true,
        source: "https://opencode.ai/docs/skills",
        verified: true,
    },
    ToolSpec {
        id: "amp",
        label: "Amp",
        skills_dir: Some(".config/amp/skills"),
        reads_shared_default: true,
        source: "https://ampcode.com/docs/customize/skills",
        verified: true,
    },
    ToolSpec {
        id: "gemini-cli",
        label: "Gemini CLI",
        skills_dir: Some(".gemini/skills"),
        reads_shared_default: true,
        source: "https://geminicli.com/docs/cli/skills/",
        verified: true,
    },
    ToolSpec {
        id: "devin",
        label: "Windsurf / Devin",
        skills_dir: Some(".codeium/windsurf/skills"),
        reads_shared_default: true,
        source: "https://docs.devin.ai/desktop/cascade/skills",
        verified: true,
    },
    ToolSpec {
        id: "droid",
        label: "Factory Droid",
        skills_dir: Some(".factory/skills"),
        reads_shared_default: true,
        source: "https://docs.factory.ai/harness/skills",
        verified: true,
    },
    ToolSpec {
        id: "roo",
        label: "Roo Code",
        skills_dir: Some(".roo/skills"),
        reads_shared_default: true,
        source: "https://roocodeinc.github.io/Roo-Code/features/skills",
        verified: true,
    },
];

/// Tools whose directories this app used to write into but which were never
/// real. A link left there points at a directory no tool reads, so it is
/// removed on upgrade. Kept separate from `TOOLS` so it can never be listed or
/// distributed into again.
pub const LEGACY_SKILLS_DIRS: &[&str] = &[".workbuddy-ai/skills"];

pub fn find(tool_id: &str) -> Option<&'static ToolSpec> {
    TOOLS.iter().find(|tool| tool.id == tool_id)
}

/// A user's change to a tool's declared behaviour, persisted in Settings.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOverride {
    /// Overrides `ToolSpec::reads_shared_default`. Tools gain shared-directory
    /// support over time, so the registry's default can go stale while the
    /// tool on disk has not changed.
    #[serde(default)]
    pub reads_shared: Option<bool>,
    /// Replaces the registry path. Absolute, or relative to home when it does
    /// not start with a separator or drive letter.
    #[serde(default)]
    pub skills_dir: Option<String>,
}

/// Resolves a tool's directories against the user's home plus their overrides.
#[derive(Debug, Clone)]
pub struct ToolResolver {
    home: PathBuf,
    overrides: BTreeMap<String, ToolOverride>,
}

impl ToolResolver {
    pub fn new(home: PathBuf, overrides: BTreeMap<String, ToolOverride>) -> Self {
        Self { home, overrides }
    }

    pub fn override_for(&self, tool_id: &str) -> Option<&ToolOverride> {
        self.overrides.get(tool_id)
    }

    /// The directory this tool reads skills from, after overrides.
    pub fn root(&self, tool: &ToolSpec) -> Option<PathBuf> {
        if let Some(custom) = self
            .overrides
            .get(tool.id)
            .and_then(|entry| entry.skills_dir.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(self.resolve_custom(custom));
        }
        tool.skills_dir.map(|relative| join_relative(&self.home, relative))
    }

    /// An override may be absolute or home-relative, so a user can paste either
    /// `D:\skills\claude` or `.claude/skills`.
    fn resolve_custom(&self, value: &str) -> PathBuf {
        let candidate = Path::new(value);
        let absolute = candidate.is_absolute()
            || value.starts_with(['/', '\\'])
            // `C:\...` and `C:/...` are not `is_absolute()` on non-Windows
            // hosts, but the string is still a Windows absolute path.
            || value.chars().nth(1).is_some_and(|c| c == ':');
        if absolute {
            candidate.to_path_buf()
        } else {
            join_relative(&self.home, value)
        }
    }

    /// Whether this tool reads the shared directory, after overrides.
    pub fn reads_shared(&self, tool: &ToolSpec) -> bool {
        self.overrides
            .get(tool.id)
            .and_then(|entry| entry.reads_shared)
            .unwrap_or(tool.reads_shared_default)
    }

    /// Whether this tool needs a link for each skill.
    pub fn needs_distribution(&self, tool: &ToolSpec) -> bool {
        tool.distributable() && !self.reads_shared(tool)
    }

    pub fn skill_path(
        &self,
        tool: &ToolSpec,
        name: &str,
    ) -> Result<Option<PathBuf>, SkillsageError> {
        let Some(root) = self.root(tool) else {
            return Ok(None);
        };
        Ok(Some(root.join(super::repo::layout::safe_component(name)?)))
    }

    /// Where a tool is installed, used to tell "not installed" from "installed
    /// but never distributed into". The skills directory itself is the signal
    /// we can rely on, plus the tool's config directory when it has one.
    pub fn detected(&self, tool: &ToolSpec) -> bool {
        if let Some(root) = self.root(tool) {
            if root.exists() {
                return true;
            }
            // A tool that has never been used may not have a `skills/`
            // directory yet, but its config directory will exist.
            if let Some(parent) = root.parent() {
                if parent.exists() {
                    return true;
                }
            }
        }
        false
    }
}

fn join_relative(home: &Path, relative: &str) -> PathBuf {
    let mut path = home.to_path_buf();
    for segment in relative.split(['/', '\\']).filter(|s| !s.is_empty()) {
        path.push(segment);
    }
    path
}

/// What the frontend needs to render one row in Settings.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolView {
    pub id: String,
    pub label: String,
    /// Resolved directory, or `None` for a tool with no directory of its own.
    pub skills_dir: Option<String>,
    /// The registry's default, so the UI can show what "reset" would restore.
    pub reads_shared_default: bool,
    /// The effective value after overrides.
    pub reads_shared: bool,
    /// Whether the user has overridden either field.
    pub customized: bool,
    pub detected: bool,
    /// Whether a link per skill is needed at all.
    pub distributable: bool,
    pub source: String,
    pub verified: bool,
}

pub fn list(resolver: &ToolResolver) -> Vec<ToolView> {
    TOOLS
        .iter()
        .map(|tool| {
            let over = resolver.override_for(tool.id);
            ToolView {
                id: tool.id.to_string(),
                label: tool.label.to_string(),
                skills_dir: resolver
                    .root(tool)
                    .map(|path| path.to_string_lossy().into_owned()),
                reads_shared_default: tool.reads_shared_default,
                reads_shared: resolver.reads_shared(tool),
                customized: over.is_some_and(|entry| {
                    entry.reads_shared.is_some()
                        || entry
                            .skills_dir
                            .as_deref()
                            .is_some_and(|value| !value.trim().is_empty())
                }),
                detected: resolver.detected(tool),
                distributable: resolver.needs_distribution(tool),
                source: tool.source.to_string(),
                verified: tool.verified,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home() -> PathBuf {
        PathBuf::from("/home/tester")
    }

    #[test]
    fn resolves_registry_paths_under_home() {
        let resolver = ToolResolver::new(home(), BTreeMap::new());
        let claude = find("claude-code").expect("claude-code is registered");
        assert_eq!(
            resolver.root(claude).expect("has a root"),
            home().join(".claude").join("skills")
        );
    }

    #[test]
    fn an_override_replaces_the_registry_path() {
        let mut overrides = BTreeMap::new();
        overrides.insert(
            "claude-code".to_string(),
            ToolOverride {
                reads_shared: None,
                skills_dir: Some("D:\\custom\\claude".into()),
            },
        );
        let resolver = ToolResolver::new(home(), overrides);
        let claude = find("claude-code").expect("registered");
        assert_eq!(
            resolver.root(claude).expect("has a root"),
            PathBuf::from("D:\\custom\\claude")
        );
    }

    #[test]
    fn a_relative_override_resolves_under_home() {
        let mut overrides = BTreeMap::new();
        overrides.insert(
            "cursor".to_string(),
            ToolOverride {
                reads_shared: None,
                skills_dir: Some("custom/cursor".into()),
            },
        );
        let resolver = ToolResolver::new(home(), overrides);
        let cursor = find("cursor").expect("registered");
        assert_eq!(
            resolver.root(cursor).expect("has a root"),
            home().join("custom").join("cursor")
        );
    }

    #[test]
    fn reads_shared_follows_the_override() {
        let cursor = find("cursor").expect("registered");
        let claude = find("claude-code").expect("registered");

        let resolver = ToolResolver::new(home(), BTreeMap::new());
        assert!(resolver.reads_shared(cursor));
        assert!(!resolver.needs_distribution(cursor));
        assert!(!resolver.reads_shared(claude));
        assert!(resolver.needs_distribution(claude));

        let mut overrides = BTreeMap::new();
        overrides.insert(
            "claude-code".to_string(),
            ToolOverride {
                reads_shared: Some(true),
                skills_dir: None,
            },
        );
        let resolver = ToolResolver::new(home(), overrides);
        assert!(!resolver.needs_distribution(claude));
    }

    #[test]
    fn every_registered_tool_resolves_a_safe_skill_path() {
        let resolver = ToolResolver::new(home(), BTreeMap::new());
        for tool in TOOLS {
            if let Some(path) = resolver.skill_path(tool, "demo").expect("safe name") {
                assert!(path.ends_with("demo"), "{} should end with the skill", tool.id);
            }
            // Unsafe names are rejected for every tool.
            assert!(resolver.skill_path(tool, "../escape").is_err());
        }
    }

    #[test]
    fn tool_ids_are_unique() {
        let mut seen = std::collections::BTreeSet::new();
        for tool in TOOLS {
            assert!(seen.insert(tool.id), "duplicate tool id: {}", tool.id);
        }
    }

    #[test]
    fn legacy_dirs_are_not_registered_tools() {
        for legacy in LEGACY_SKILLS_DIRS {
            assert!(
                !TOOLS.iter().any(|tool| tool.skills_dir == Some(*legacy)),
                "{legacy} must not be distributable again"
            );
        }
    }
}
