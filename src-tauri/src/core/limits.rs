//! Resource limits for data that can originate outside SkillSage.
//!
//! These limits are deliberately centralized so a new remote/local ingestion
//! path cannot silently choose an unlimited default.

pub const MAX_REMOTE_TEXT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_REMOTE_JSON_BYTES: usize = 8 * 1024 * 1024;
/// Updater manifests (`latest.json`) and GitHub release metadata. These are
/// small JSON documents fetched from volunteer-run mirror hosts, so they get
/// their own explicit bound instead of the generic 8 MiB remote-JSON one: a
/// real manifest is ~1.5 KiB and a release's metadata ~10 KiB, so 256 KiB
/// leaves ample room for release notes while keeping a hostile node from
/// buffering an arbitrary body.
pub const MAX_UPDATE_JSON_BYTES: usize = 256 * 1024;
pub const MAX_GITHUB_TREE_ENTRIES: usize = 100_000;
pub const MAX_REMOTE_SKILL_FILES: usize = 2_000;
pub const MAX_REMOTE_SKILL_TOTAL_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_REMOTE_SKILL_CANDIDATES: usize = 100;
pub const MAX_LOCAL_SKILL_FILES: usize = 10_000;
pub const MAX_LOCAL_SKILL_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_SYNC_PACKAGE_BYTES: u64 = 8 * 1024 * 1024;
pub const MAX_SYNC_SKILLS: usize = 1_000;
