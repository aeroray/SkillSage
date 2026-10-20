# Area: Legacy Paths

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-57c2fd87 — `~/.workbuddy-ai/skills` is not a real directory

Status: active
Scope: area:legacy-paths
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: data-model

Evidence:
- repo:src-tauri/src/core/tools.rs
- doc:docs/research/workbuddy-skill-path.md

Constraint:
`~/.workbuddy-ai/skills` must never be written to again. The real CodeBuddy/WorkBuddy path is `~/.codebuddy/skills`, confirmed against the vendor docs in `docs/research/workbuddy-skill-path.md`. Links left there by older builds are removed at startup by `clean_legacy_links`, and only when they resolve inside the shared directory — `tools::LEGACY_SKILLS_DIRS` exists solely for that cleanup.

