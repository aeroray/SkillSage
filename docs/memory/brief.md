# Project Brief

SkillSage is a Tauri 2 desktop manager for AI Agent skills on Windows and macOS. It installs remote or locally imported skills into a private central repository, then distributes them to supported AI tools through links.

Current direction: Phase 3 adds the live skills.sh store shell: public search, HTML leaderboard/detail parsing, GitHub-backed file retrieval, store detail UI, tool selection, and generic installation through the Phase 2 Rust pipeline. Phase 4 adds installed-skill management: commit-based version records, update checks, atomic replacement with snapshots, rollback with remote/local fallback, uninstall, distribution adjustment, batch distribution, and an author-grouped management page. Phase 5 completes local directory/file import, GitHub repository URL parsing and skill selection, encrypted GitHub token storage through the OS keyring, and persisted proxy injection for GitHub/store requests. Phase 6 adds remote-only sync manifests, selective restore with tool detection, legacy skill scanning/adoption, and explicit distribution conflict handling. Phase 7 is complete with unified UI states, network guidance, cleanup flows, tracing logs, cross-platform QA automation, and project documentation.

MemoryCustodian is enabled; durable context stays short, current, human-readable, and versionable under this directory.
