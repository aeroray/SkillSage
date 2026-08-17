# Project Brief

SkillSage is a Tauri 2 desktop manager for AI Agent skills on Windows and macOS. It installs remote skills into a private central repository, then distributes them to supported AI tools through links; local imports, versions, sync, and migration are planned later.

Current direction: Phase 2 now provides the Rust install foundation: SKILL.md validation, atomic central-repository writes, content hashes, lock records, tool detection, platform links, and a built-in end-to-end test fixture. The next milestone is the live skills.sh store flow.

MemoryCustodian is enabled; durable context stays short, current, human-readable, and versionable under this directory.
