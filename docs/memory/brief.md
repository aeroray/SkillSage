# Project Brief

SkillSage is a Tauri 2 desktop manager for AI Agent skills on Windows and macOS. It installs remote or locally imported skills directly into a single shared public directory (`~/.agents/skills/`) that every AI tool already reads from — no per-tool distribution, no tool detection or registration. See `docs/memory/decisions.md`'s "2026-08-20 - Single shared public-directory install model" entry and `docs/memory/do-not-use.md` for the per-tool symlink/junction model this replaced.

The historical Phase 1–7 work established the store, installed-skill management, local/GitHub import, sync, and adoption flows. The original private-repository and per-tool-distribution model was superseded on 2026-08-20 by the single-shared-directory redesign. Current behavior is direct install to the public directory, single-path conflict handling (skip/takeover/cancel), public-directory-only adoption, explicit repair for `SKILL.md` name mismatches, safe removal of invalid real directories, and sync without per-tool choices. Source code, tests, the root README, and the QA guide are the active implementation references; historical specifications are not maintained as a second source of truth.

MemoryCustodian is enabled; durable context stays short, current, human-readable, and versionable under this directory.
