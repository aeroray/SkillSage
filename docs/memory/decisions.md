# Decisions

## 2026-08-17 - Use local MemoryCustodian memory

Decision:
Store durable project memory in `docs/memory/` and route Codex, Claude Code, Gemini, generic agents, and GitHub Copilot through short platform entry files.
Reason:
This keeps project context local, inspectable, portable, and consistent across supported agent platforms.

## Product architecture

Decision: SkillSage uses Tauri 2 with a React/TypeScript frontend and a Rust backend; backend commands stay thin while domain logic lives in Tauri-independent Rust core modules.
Reason: This preserves testability and keeps desktop integration separate from reusable skill-management logic.

## Desktop window baseline

Decision: SkillSage is a desktop-only application with a default main window of 1200×800 and a hard minimum of 1200×800; the window remains resizable and maximizable.
Reason: The product's information-dense desktop layout does not require mobile adaptation, and the minimum size prevents the navigation rail and management surfaces from collapsing.

## Central repository

Decision: The private `~/.skillsage/` repository is the single source of truth; supported AI tool directories receive symlinks on macOS or junctions on Windows, never copied skill contents.
Reason: Updates become immediate and permissions remain scoped to explicitly selected tools.

## Phase 1 shell

Decision: The initial UI exposes `/store`, `/skills`, and `/settings` behind a persistent left navigation rail, with `/` redirecting to `/store`.
Reason: This matches the product's core information architecture while leaving domain features for later phases.

## Supported tools

Decision: The first release targets Claude Code, Cursor, GitHub Copilot, OpenAI Codex CLI, and OpenCode; custom tool registration is out of scope.
Reason: A fixed registry keeps detection and distribution predictable and aligned with the minimum-permission principle.

## Development watcher boundary

Decision: Vite must ignore `src-tauri/**` during development.
Reason: Windows can lock Rust build executables under `src-tauri/target`, causing Vite's watcher to fail with `EBUSY` while Tauri compiles.

## Phase 2 verification fixture

Decision: Phase 2 validates the install pipeline with an offline built-in skill fixture; the GitHub tree/download client is implemented for later live sources.
Reason: Local acceptance remains deterministic while preserving the same parse, hash, atomic write, distribute, and lock boundaries used by remote installs.

## Windows link invocation

Decision: Normalize registered tool paths to Windows separators and pass junction paths as separate `Command` arguments to `mklink`.
Reason: Forward slashes can be parsed as `mklink` switches, while manually embedded quotes break `cmd.exe` argument parsing for paths containing spaces.

## Store endpoint strategy

Decision: The desktop store uses the public legacy `/api/search` endpoint and skills.sh HTML pages, then retrieves install files from the linked GitHub repository.
Reason: The newer `/api/v1` endpoints require Vercel OIDC authentication, which is not available to a standalone desktop app before Phase 5 settings support.

## Phase 4 version and rollback strategy

Decision: A live store install resolves the repository default branch to a Git commit SHA before downloading files; updates record the previous commit/hash in `versionHistory`, snapshot the central skill directory, and atomically replace it. Rollback first fetches the requested commit and falls back to the matching local snapshot when the remote is unavailable.
Reason: Commit SHAs make update checks deterministic, while snapshots keep rollback usable during transient network failures.

## Phase 4 management writes

Decision: Update, rollback, uninstall, distribution adjustment, and batch distribution remain Rust-owned commands behind the shared `AppState` async write lock; read-only listing and update checks do not take that lock.
Reason: Centralizing filesystem mutation preserves the single-source-of-truth and prevents concurrent lockfile/link races.

## Frontend component baseline

Decision: Frontend controls and overlays use source-owned shadcn/Radix components configured in `components.json`; page-level styling stays in Tailwind utility classes, while `App.css` only retains Tailwind directives.
Reason: This keeps keyboard behavior, focus states, and semantic interaction consistent across the desktop UI without retaining parallel hand-rolled controls.

## shadcn and Tailwind version baseline

Decision: The project uses Tailwind CSS v4 with the first-party Vite plugin and CSS-first `@theme inline` tokens; shadcn components should follow v4 syntax when updated.
Reason: This keeps the Vite build chain current and makes the source-owned component theme compatible with the current shadcn registry.

## Phase 5 source and settings boundary

Decision: Local imports are stored under `~/.skillsage/local/<name>` with `local://` lock records, while GitHub URL installs resolve a repository/tree/blob/raw URL into a manifest-backed skill detail and reuse the existing Rust store install pipeline.
Reason: This keeps all filesystem mutation, conflict handling, hashing, and distribution behind the same lifecycle boundaries as store installs.

Decision: Proxy configuration is persisted as local JSON and the GitHub token is stored through the OS keyring; Rust loads both at request time and injects them into Store and GitHub clients.
Reason: Secrets do not enter the project settings file, while proxy changes take effect without putting network configuration in frontend code.

## Phase 6 sync and migration boundary

Decision: Sync packages contain only remote lock metadata and never skill contents or local records; import previews let users select skills and per-skill detected-tool targets before the standard GitHub install pipeline runs.
Reason: Export files remain portable and small while a new device reconstructs content from the recorded remote commit.

Decision: Migration scans registered tool roots and `~/.agents/skills/`, skips links into `~/.skillsage/`, and adopts valid external entities into central local or remote records; unknown links stay untouched.
Reason: The scanner preserves the single-source-of-truth and avoids silently deleting entries whose ownership cannot be established.

Decision: External distribution conflicts require an explicit skip, takeover, or cancel action; takeover preserves the old entity under a renamed local record before the requested skill occupies the original tool path.
Reason: Conflict resolution must be reversible enough to avoid silently destroying pre-existing skills.
