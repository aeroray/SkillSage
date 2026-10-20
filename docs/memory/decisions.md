# Decisions

Entries are newest first.

## MC-DEC-20261020-9201ae25 — Tauri 2 with thin commands over a testable Rust core

Status: active
Scope: project
Subject: MC-SUBJ-20261020-4c1effeb
Facet: architecture

Evidence:
- repo:src-tauri/src/lib.rs

Decision:
Tauri commands stay thin; domain logic lives in Tauri-independent `core/` modules.

Reason:
`core/` stays testable with plain `cargo test`, and desktop integration stays separate from reusable skill management.

## MC-DEC-20261020-6c231048 — One shared directory replaces per-tool distribution

Status: active
Scope: project
Subject: MC-SUBJ-20261020-c3c4ac80
Facet: architecture

Evidence:
- repo:src-tauri/src/core/repo/layout.rs

Decision:
Skills install as real content into one shared directory (`~/.agents/skills/`); tools that do not read it get a managed link.

Reason:
Link-based isolation never held — other tools already read shared locations — so the per-tool junction machinery bought no guarantee.

## MC-DEC-20261020-9d78e0d5 — The tool list is a declarative registry

Status: active
Scope: project
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: lifecycle

Evidence:
- repo:src-tauri/src/core/tools.rs

Decision:
`core/tools.rs` holds one entry per tool: path, shared-directory flag, source URL, `verified` flag. The frontend never names a tool itself.

Reason:
The two hardcoded adapters could not answer "which tools are installed" and shipped a path that does not exist, so an uninstalled tool kept appearing.

## MC-DEC-20261020-8759e3ee — The updater races mirrors instead of pinning one

Status: active
Scope: project
Subject: MC-SUBJ-20261020-b6d4abda
Facet: lifecycle

Evidence:
- repo:src-tauri/src/core/mirrors.rs

Decision:
Update check and download race every mirror plus direct GitHub and use the first valid manifest; the plugin supplies only signature verification and the installer.

Reason:
The plugin walks endpoints sequentially, so a hanging first node costs the full timeout, and volunteer nodes disappear — pinning one eventually breaks for everyone.

## MC-DEC-20261020-7d734c45 — The GitHub-URL install is pinned to the inspected commit

Status: active
Scope: project
Subject: MC-SUBJ-20261020-0ae718ea
Facet: architecture

Evidence:
- repo:src-tauri/src/core/url_install/resolver.rs

Decision:
`inspect_github_url` returns `resolvedCommit`; the dialog echoes it back and the install resolves files from that exact commit.

Reason:
Without the pin, anyone able to push could change the payload between preview and click — and the manifest name decides the on-disk directory.

## MC-DEC-20261020-0774ade3 — Adopt replaces the migrate flow

Status: active
Scope: project
Subject: MC-SUBJ-20261020-c3c4ac80
Facet: workflow

Evidence:
- repo:src-tauri/src/core/migrate/scanner.rs

Decision:
The adopt scanner registers untracked real directories in place once the folder name agrees with `SKILL.md`; a mismatch is repaired by explicit rename.

Reason:
Registration no longer moves content, while the explicit rename makes the name AI tools see canonical.

## MC-DEC-20261020-a7420fe0 — Release notes live in the repository, one file per tag

Status: active
Scope: project
Subject: MC-SUBJ-20261020-b6d4abda
Facet: compatibility

Evidence:
- repo:scripts/load-release-notes.mjs

Decision:
Each tag's notes are authored at `docs/releases/<tag>.md`; the workflow fails when that file is missing or empty.

Reason:
Inline notes had to be hand-edited every release and were silently reused when forgotten, publishing the previous version's notes under a new tag.
