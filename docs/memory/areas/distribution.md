# Area: Distribution

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-492932c2 — The tool registry is the only tool list

Status: active
Scope: area:distribution
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: architecture

Evidence:
- repo:src-tauri/src/core/tools.rs

Constraint:
`core/tools.rs` is the only registry. The frontend receives the resolved list from the backend and must never name a tool itself. Each entry carries its path, whether it reads the shared directory, the documentation URL, and a `verified` flag; an unverified path renders with the 'path unverified' badge rather than as vendor-documented.

## MC-CON-20261020-edb26abb — Tool overrides are patched, not replaced

Status: active
Scope: area:distribution
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: interface

Evidence:
- repo:src-tauri/src/core/settings.rs

Constraint:
`set_tool_override` patches fields: an omitted field keeps its stored value, `clearSkillsDir` removes a customized path, and a `readsShared` equal to the registry default is normalized away. Replacing the whole entry made the 'reads the shared directory' toggle delete the user's customized directory.

## MC-CON-20261020-f95ed745 — A shared-reading tool is never linked

Status: active
Scope: area:distribution
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: behavior

Evidence:
- repo:src-tauri/src/core/distribution.rs

Constraint:
A tool marked as reading the shared directory must not be linked, and turning that flag on removes its existing links. Only detected tools (plus any already holding a link) appear in per-skill distribution UI; Settings lists the full registry.

## MC-CON-20261020-8686ac71 — cmd cannot carry `%` or `"` in a path

Status: active
Scope: area:distribution
Subject: MC-SUBJ-20261020-27ddfa2e
Facet: compatibility

Evidence:
- repo:src-tauri/src/core/distribution.rs

Constraint:
`quote_for_cmd` refuses paths containing `%` or `"` instead of pretending to escape them — `^%` does not stop cmd expanding a variable, and `\"` is not cmd syntax. Silently rewriting the meaning creates a junction at a different path than the lock file records. The long-term fix is a direct `CreateSymbolicLinkW` call.
