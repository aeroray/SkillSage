# Area: Updater

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-a517ca83 — Update responses are bounded and timed out

Status: active
Scope: area:updater
Subject: MC-SUBJ-20261020-b6d4abda
Facet: performance

Evidence:
- repo:src-tauri/src/core/mirrors.rs

Constraint:
Mirror manifest and release-metadata bodies go through the `core/limits.rs` reader (`MAX_UPDATE_JSON_BYTES`). The updater plugin's own client gets connect and read timeouts through `configure_client` — it applies none by default, so a stalled node would hang the command forever.

## MC-CON-20261020-b1a2deb2 — The installer is bound to its announced version

Status: active
Scope: area:updater
Subject: MC-SUBJ-20261020-b6d4abda
Facet: security

Evidence:
- repo:src-tauri/src/commands/update.rs

Constraint:
The downloaded installer's length is cross-checked against trusted `releases/tags/v<version>` metadata before install — minisign proves *a* release, not *this* one. Fail open when metadata is unavailable, closed only on a known mismatch. The minisign signature is never bypassed on any path.

## MC-CON-20261020-f133ce3e — Mirror racing and the cache-busting token

Status: active
Scope: area:updater
Subject: MC-SUBJ-20261020-b6d4abda
Facet: architecture

Evidence:
- repo:src-tauri/src/core/mirrors.rs

Constraint:
The race covers every `MIRRORS` node plus direct GitHub and uses the first valid manifest. `MANIFEST_URL` must equal `plugins.updater.endpoints` (test-enforced). Every manifest and metadata request carries a unique cache-busting token, and the plugin's own fetch reuses the winning hit's token via `ManifestHit::endpoint()`. A mirror's asset URL is rewritten to its `releases/download/...` form, falling back to the original on failure.

## MC-CON-20261020-80ecf6f7 — Release notes are untrusted text

Status: active
Scope: area:updater
Subject: MC-SUBJ-20261020-b6d4abda
Facet: data-model

Evidence:
- repo:src/features/update/release-notes.ts

Constraint:
`AppUpdateInfo.notes` is untrusted: the signature covers the installer, not the manifest, so the fastest mirror controls that string. Render it only through `release-notes.ts` + `ReleaseNotes.tsx`, which produce plain strings React escapes. Never use `dangerouslySetInnerHTML`; unrecognized lines stay paragraphs rather than being dropped.
