# Project Brief

SkillSage is a Tauri 2 desktop manager for AI Agent skills on Windows and macOS. It installs remote skills into a private central repository, then distributes them to supported AI tools through links; local imports, versions, sync, and migration are planned later.

Current direction: Phase 3 adds the live skills.sh store shell: public search, HTML leaderboard/detail parsing, GitHub-backed file retrieval, store detail UI, tool selection, and generic installation through the Phase 2 Rust pipeline. Phase 4 now adds installed-skill management: commit-based version records, update checks, atomic replacement with snapshots, rollback with remote/local fallback, uninstall, distribution adjustment, batch distribution, and an author-grouped management page. The next milestone is local import and broader settings/sync work.

MemoryCustodian is enabled; durable context stays short, current, human-readable, and versionable under this directory.
