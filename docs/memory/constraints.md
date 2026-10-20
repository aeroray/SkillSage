# Constraints

## MC-CON-20261020-9201ae25 — One shared directory is the only real copy

Status: active
Scope: project
Subject: MC-SUBJ-20261020-aa80508b
Facet: data-model

Evidence:
- repo:src-tauri/src/core/repo/layout.rs

Constraint:
Skills install as real content into one shared directory (`~/.agents/skills/`, flat). Tools that do not read it get a managed link to that copy; content is never copied into a tool directory.

## MC-CON-20261020-6c231048 — Takeover keeps the displaced directory

Status: active
Scope: project
Subject: MC-SUBJ-20261020-aa80508b
Facet: behavior

Evidence:
- repo:src-tauri/src/core/repo/conflict.rs

Constraint:
Takeover renames an untracked path aside as `<name>.skillsage-backup-<ts>-<pid>` and **keeps it**; `finalize()` stays a logged no-op, because the conflict dialog promises to keep the displaced content under a new name.

## MC-CON-20261020-8759e3ee — Secrets never reach settings JSON or logs

Status: active
Scope: project
Subject: MC-SUBJ-20261020-aa80508b
Facet: security

Evidence:
- repo:src-tauri/src/core/settings.rs

Constraint:
The GitHub token lives only in the OS keyring — never in `settings.json`, sync exports, or logs. Proxy URLs may embed credentials, so updater logging stays at Info.

## MC-CON-20261020-71bb11af — Desktop-only, minimum window 1200×800

Status: active
Scope: project
Subject: MC-SUBJ-20261020-aa80508b
Facet: interface

Evidence:
- repo:src-tauri/tauri.conf.json

Constraint:
The main window opens at 1200×800 and never shrinks below it. No mobile breakpoints.
