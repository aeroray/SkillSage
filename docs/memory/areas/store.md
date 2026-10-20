# Area: Store

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-fc89d455 — The GitHub-URL install is pinned to the previewed commit

Status: active
Scope: area:store
Subject: MC-SUBJ-20261020-0ae718ea
Facet: security

Evidence:
- repo:src-tauri/src/core/url_install/resolver.rs

Constraint:
`inspect_github_url` returns `resolvedCommit`, the frontend echoes it to `url_install`, and `resolve_detail` resolves files from that commit instead of re-resolving the branch. Never drop the pin — re-resolving lets anyone who can push swap the payload between preview and click, and the manifest name from the new commit decides the on-disk directory.

## MC-CON-20261020-7f099bc4 — Every remote ingestion path applies its limit

Status: active
Scope: area:store
Subject: MC-SUBJ-20261020-0ae718ea
Facet: data-model

Evidence:
- repo:src-tauri/src/core/limits.rs

Constraint:
`core/limits.rs` centralizes every bound on externally-originated data so a new ingestion path cannot silently choose an unlimited default. Bodies are streamed and rejected as they exceed the cap — checking only `Content-Length` is not enough, since a chunked response would be buffered in full first.

## MC-CON-20261020-391af476 — Listing a repo reads only the manifests

Status: active
Scope: area:store
Subject: MC-SUBJ-20261020-0ae718ea
Facet: performance

Evidence:
- repo:src-tauri/src/core/url_install/resolver.rs

Constraint:
`resolve_skills` probes each candidate by resolving its path from the tree and fetching only `SKILL.md`; downloading every file of every candidate (up to `MAX_REMOTE_SKILL_CANDIDATES`) is reserved for `resolve_detail`, which actually installs one skill.

## MC-CON-20261020-e2dcda5f — Blocking settings reads run off the async runtime

Status: active
Scope: area:store
Subject: MC-SUBJ-20261020-0ae718ea
Facet: compatibility

Evidence:
- repo:src-tauri/src/core/lifecycle/remote.rs

Constraint:
Settings and keyring reads (`load_runtime`) do blocking filesystem and OS-keyring work, so every `async fn` that needs them wraps the call in `spawn_blocking`. Running it inline ties up a runtime worker; on macOS it can raise a system prompt.
