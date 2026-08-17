# MemoryCustodian Manifest

protocol_version: 1
initialized_with: memory-custodian
last_migrated_with: memory-custodian
memory_root: docs/memory

## Default Loading

- `brief.md`

## Task Routing

- general continuation: `brief.md`
- planning: `brief.md`, `decisions.md`, `constraints.md`, `do-not-use.md`
- implementation: `brief.md`, `decisions.md`, `constraints.md`, `do-not-use.md`
- artifact work: `brief.md`, `constraints.md`, `do-not-use.md`
- preferences: `brief.md`, `constraints.md`, `preferences.md` when present
- history: `brief.md`, `changelog.md` when present
- maintenance: `brief.md`, `inbox.md`, `changelog.md` when present

## Optional Module Index

No optional rules, profiles, or areas are enabled.

## Explicit-Only Files

- `archive/` is explicit-request only.
- `inbox.md` is not loaded outside maintenance, compaction, audit, or an explicit request.

## Context Budgets

- `brief.md`: 500 tokens
- `decisions.md`: 800 tokens
- `constraints.md`: 400 tokens
- `do-not-use.md`: 400 tokens
- Optional files: follow the limits in the MemoryCustodian protocol.
