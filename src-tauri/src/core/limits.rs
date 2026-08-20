//! Resource limits for data that can originate outside SkillSage.
//!
//! These limits are deliberately centralized so a new remote/local ingestion
//! path cannot silently choose an unlimited default.

pub const MAX_REMOTE_TEXT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_REMOTE_JSON_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_GITHUB_TREE_ENTRIES: usize = 100_000;
pub const MAX_REMOTE_SKILL_FILES: usize = 2_000;
pub const MAX_REMOTE_SKILL_TOTAL_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_REMOTE_SKILL_CANDIDATES: usize = 100;
pub const MAX_LOCAL_SKILL_FILES: usize = 10_000;
pub const MAX_LOCAL_SKILL_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
