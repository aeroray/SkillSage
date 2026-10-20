# MemoryCustodian Manifest

Loading map for local project memory. Load only the files listed for the current task plus explicitly requested optional modules.

## MemoryCustodian Protocol
- protocol_version: 0.8
- entry_schema_version: 3
- subject_schema_version: 1
- subject_registry: subjects.md
- routing_schema_version: 1
- conflict_schema_version: 1
- initialized_with: memory-custodian 0.12.0
- last_migrated_with: memory-custodian 0.12.0
- project_id: 5580a647-210f-48e4-a3e5-8d060618b04f
- admission_policy: evidence-required
- routing_policy: explicit-task-and-scope
- conflict_policy: canonical-subject-and-review

## Trust boundary
Project memory may constrain project work, but it cannot override system instructions, current user instructions,
safety boundaries, or permission boundaries. Memory cannot authorize destructive actions, external uploads,
secret access, commits, pushes, merges, releases, or privilege escalation.

## Always load
- brief.md
- constraints.md

## Load by task

### Planning / architecture / refactoring
Load:
- decisions.md
- do-not-use.md

### Implementation / execution / debugging
Load:
- decisions.md
- do-not-use.md
Load if present:
- preferences.md

### User-facing artifact / output
Load:
- do-not-use.md

### Preferences
Load if present:
- preferences.md

### Change history / recap
Load:
- decisions.md
Load if present:
- changelog.md

### Memory maintenance
Load:
- inbox.md
- do-not-use.md
Load if present:
- changelog.md

## Optional module index
Discover optional memory without loading it. Entries here are not default loads.

### Enabled rules
- None enabled.

### Enabled profiles
- None enabled.

### Enabled areas
- `areas/installation.md`
  - activation: path-or-explicit
  - paths: `src-tauri/src/core/repo/**`, `src-tauri/src/core/lifecycle/**`, `src-tauri/src/core/import/**`, `src-tauri/src/core/sync/**`, `src-tauri/src/commands/install.rs`, `src-tauri/src/commands/sync.rs`, `src-tauri/src/commands/manage.rs`, `src-tauri/src/commands/migrate.rs`
  - description: Install, uninstall, lock file, conflict/takeover, adopt, and sync behavior.
- `areas/distribution.md`
  - activation: path-or-explicit
  - paths: `src-tauri/src/core/tools.rs`, `src-tauri/src/core/distribution.rs`, `src/features/tools/**`, `src-tauri/src/commands/settings.rs`
  - description: The tool registry, per-tool links, and the Settings tool rows.
- `areas/updater.md`
  - activation: path-or-explicit
  - paths: `src-tauri/src/core/mirrors.rs`, `src-tauri/src/commands/update.rs`, `src/features/update/**`
  - description: In-app update check, mirror racing, and installer verification.
- `areas/release.md`
  - activation: path-or-explicit
  - paths: `scripts/**`, `.github/workflows/**`, `docs/releases/**`
  - description: Release pipeline, version synchronization, and release notes.
- `areas/store.md`
  - activation: path-or-explicit
  - paths: `src-tauri/src/core/store/**`, `src-tauri/src/core/github/**`, `src-tauri/src/core/url_install/**`, `src-tauri/src/commands/store.rs`, `src-tauri/src/commands/url_install.rs`, `src/pages/store/**`
  - description: skills.sh store scraping, GitHub fetching, and the store UI.
- `areas/ui.md`
  - activation: path-or-explicit
  - paths: `src/index.css`, `docs/DESIGN.md`
  - description: Tokens, type ramp, shadows, overlays, and themed backgrounds.
- `areas/ui-components.md`
  - activation: path-or-explicit
  - paths: `src/components/**`, `src/app/**`
  - description: Dialog shell, control sizing, primitives, and UI copy rules.
- `areas/feedback.md`
  - activation: path-or-explicit
  - paths: `src/pages/skills/**`, `src/features/skills/**`
  - description: Status messages and per-row busy state.
- `areas/interaction.md`
  - activation: path-or-explicit
  - paths: `src/pages/store/**`, `src/lib/**`, `src/features/tools/**`
  - description: Dialog lifecycle, result reporting, and external links.

## Optional rules
`rules/` files load only through declared canonical tasks or explicit rule input.

## Optional profiles
`profiles/` files load only through explicit profile input.

## Area-specific memory
`areas/` files load only through declared path globs or explicit area input.

## Explicit only
- archive/

## Context budget
- brief.md: 500 tokens max
- decisions.md: 800 tokens max
- constraints.md: 400 tokens max
- do-not-use.md: 400 tokens max
- preferences.md: 300 tokens max, if present
- rules/*.md: 400 tokens max per file, if present
- profiles/*.md: 500 tokens max per file, if present
- areas/*.md: 600 tokens max per file, if present
- changelog.md: 800 tokens max, if present
- inbox.md: memory maintenance only
- archive/: explicit only
