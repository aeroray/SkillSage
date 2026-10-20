# Do Not Use / Tombstones

Tombstones are newest first.

## MC-DNU-20261020-71bb11af — A private central repository fanned out by links

Status: active
Scope: project
Subject: MC-SUBJ-20261020-c3c4ac80
Facet: version-policy

Evidence:
- repo:docs/memory/decisions.md

Rejected:
A private repository holding the only copy, fanned out via links into a hardcoded per-tool table.

Reason:
Its premise — link-based isolation — does not hold: tools already read shared locations such as `~/.agents/skills/`.

## MC-DNU-20261020-767a492b — Copying skill content into a tool directory

Status: active
Scope: project
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: data-model

Evidence:
- repo:src-tauri/src/core/distribution.rs

Rejected:
Copying a skill's files into a tool's own directory, or any model where the shared directory is not the single real copy.

Reason:
Two copies drift, and uninstall can only remove what it can identify.

## MC-DNU-20261020-ac61c0b1 — A per-tool conflict or takeover transaction

Status: active
Scope: project
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: workflow

Evidence:
- repo:src-tauri/src/core/repo/conflict.rs

Rejected:
Resolving a collision per tool, or renaming aside another tracked record's directory.

Reason:
Conflicts are single-path against the shared directory; renaming aside a tracked record would orphan its lock entry.

## MC-DNU-20261020-aa80508b — The two-boolean distribution representation

Status: active
Scope: project
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: version-policy

Evidence:
- repo:src-tauri/src/core/repo/lockfile.rs

Rejected:
`claudeDistributed` / `workbuddyDistributed` booleans on a lock record.

Reason:
Two booleans cannot express a registry and kept reporting uninstalled tools; distribution is a `distributedTo` list.
