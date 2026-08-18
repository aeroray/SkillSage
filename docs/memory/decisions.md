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

Decision: The shipped UI exposes `/skills`, `/store`, `/migrate`, and `/settings` behind a persistent left navigation rail, with `/` redirecting to `/skills`.
Reason: Installed-skill management is the primary desktop workspace, while migration is an explicit opt-in scan rather than a hidden management-page dialog.

## Supported tools

Decision: The first release targets Claude Code, Cursor, GitHub Copilot, OpenAI Codex CLI, and OpenCode; custom tool registration is out of scope.
Reason: A fixed registry keeps detection and distribution predictable and aligned with the minimum-permission principle.

## Development watcher boundary

Decision: Vite must ignore `src-tauri/**` during development.
Reason: Windows can lock Rust build executables under `src-tauri/target`, causing Vite's watcher to fail with `EBUSY` while Tauri compiles.

## Phase 2 verification fixture

Decision: The offline built-in skill fixture remains available only to Rust unit tests; it is not exposed as a user-facing install path.
Reason: Local acceptance stays deterministic without carrying intermediate validation controls into the finished desktop product.

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

Decision: Frontend controls and overlays use source-owned shadcn/Radix components configured in `components.json`; page-level styling stays in Tailwind utility classes, while `index.css` is the single Tailwind entrypoint and token file.
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

Decision: Migration scans registered tool roots and `~/.agents/skills/`, skips links into `~/.skillsage/`, adopts confirmed entities, offers manual takeover for valid unknown links, and allows removal only for invalid links.
Reason: The scanner preserves the single-source-of-truth while giving users an explicit recovery path for unmanaged or broken entries.

Decision: External distribution conflicts require an explicit skip, takeover, or cancel action; takeover preserves the old entity under a renamed local record before the requested skill occupies the original tool path.
Reason: Conflict resolution must be reversible enough to avoid silently destroying pre-existing skills.

## 2026-08-18 - Phase 7 cleanup and observability

Decision: The app cleanup command supports full removal and metadata-only removal while retaining managed skill links in keep mode.
Reason: Existing junctions/symlinks cannot remain usable after deleting their central target, so keep mode prioritizes safe, working skills.

Decision: Tauri writes normal logs and a tracing subscriber stream to the platform app log directory in every build profile.
Reason: User feedback needs actionable diagnostics without exposing GitHub credentials.

## 2026-08-18 - Review hardening

Decision: Managed repository roots, lock/settings files, imported trees, snapshots, and distribution links reject symlink-like paths unless the path is an explicitly owned link being removed.
Reason: A desktop skill manager handles user-controlled filesystem paths; following an unexpected link could read, overwrite, or delete data outside SkillSage's repository.

Decision: Conflict takeover is treated as a reversible transaction and rolls back adopted entities when later installation or distribution steps fail.
Reason: A failed multi-step install must not leave a skill orphaned in the central repository or silently replace an external tool entry.

Decision: Leaderboard results are cached only for the current application session and can be invalidated by an explicit refresh.
Reason: This reduces repeated store requests without persisting potentially stale third-party data.

## 2026-08-18 - Canonical product logo

Decision: The repository-root `skillsage-logo.png` is SkillSage's single Logo source; public assets, frontend branding, favicon, and Tauri icons are derived from it by `pnpm sync:branding`.
Reason: Replacing one source file and rerunning one command keeps product documentation, UI, and desktop packaging consistent.

## 2026-08-18 - Confirmed light and dark visual direction

Decision: Preview 01 is the product light mode and preview 03 is the product dark mode; both modes share the same semantic Tailwind/shadcn tokens, with teal for active/status states and restrained borders and shadows.
Reason: The desktop UI should feel like a quiet native utility in light mode and an OLED workbench in dark mode without duplicating page-specific themes.

## 2026-08-18 - Plain-language UI copy

Decision: UI text should be short, direct, and user-facing; remove redundant helper text and replace internal terms such as "落库" and "接管" with plain actions.
Reason: SkillSage should explain what will happen without exposing implementation details.

## 2026-08-18 - User-selectable theme accents

Decision: The appearance settings expose teal, blue, violet, and orange accent themes, persisted with the display mode and applied through semantic light/dark tokens.
Reason: Users can personalize the interface without fragmenting page-level styling or weakening the shared visual system.

## 2026-08-18 - Device sync package scope

Decision: Device sync is managed from Settings and exports a user-selected JSON destination containing remote skill records, distribution targets, display mode, theme accent, and proxy settings. GitHub Tokens are excluded; importing preferences is explicit.
Reason: A sync file should move a usable workspace between devices without embedding credentials or silently overwriting local preferences.

## 2026-08-18 - GitHub Release distribution

Decision: GitHub Actions publishes Windows NSIS and Apple Silicon macOS DMG artifacts from `v*` tags. Both platforms also receive signed Tauri updater artifacts and `latest.json`; the release workflow derives the updater endpoint from `GITHUB_REPOSITORY` at build time.
Reason: Release metadata must follow the eventual GitHub repository without hardcoding an owner before the project has a remote, while signed artifacts are required for safe in-app updates.

## 2026-08-18 - Minimal GitHub Actions scope

Decision: Keep only the GitHub Release workflow in the repository; cross-platform QA remains available through local validation rather than a push/PR workflow.
Reason: The project currently needs release distribution automation without adding continuous checks the maintainer did not request.

## 2026-08-18 - Manual update cadence and sidebar entry

Decision: Check for application updates once asynchronously after startup, then only when the user manually requests a check. Persist the last check time locally, show update details and a silent install/relaunch action in the sidebar, and keep the detailed status in Settings.
Reason: Updates should stay quiet during normal use while remaining easy to discover and install when available.

## 2026-08-18 - Compact settings layout

Decision: Settings uses a fixed desktop two-column card grid at the 1200px minimum, grouping security/appearance and about/update/device sync; the stop-management flow remains a separated full-width section.
Reason: This reduces unused vertical space while keeping related settings scannable and isolating destructive actions.

## 2026-08-18 - Stop-management flow wording

Decision: The Settings cleanup module is presented as “停止管理”, not app uninstall. It explains the handoff use case: keep current skill files and links while removing SkillSage management records, or explicitly clean up SkillSage-created skill data and links.
Reason: The action controls SkillSage’s ownership of managed skills; the operating-system uninstaller remains a separate product lifecycle action.

## 2026-08-18 - Installed skills management surface

Decision: The installed-skills page presents local import, GitHub URL installation, and the store as peer actions in the top-right. Filters, selection, batch actions, and author groups share one management panel; the master selection checkbox exposes an indeterminate state when only part of the filtered result is selected.
Reason: Installation entry points belong to the same skill-management context, while the selection workflow should visually and semantically connect its controls to the list it operates on.

## 2026-08-18 - Selection-scoped update checks

Decision: The installed-skills “检查更新” action is enabled only when skills are selected and checks exactly those selected skill IDs; the page's initial refresh and lifecycle refreshes may still check all installed skills.
Reason: Batch operations should share one predictable selection scope instead of silently operating on the entire repository.

## 2026-08-18 - Migration and store visual hierarchy

Decision: Migration results use compact single-line path fields, explicit right-side action panels for manual/invalid items, and no redundant pending-count badge. Store browsing uses left-aligned colored ranking tabs, a right-aligned search field, text-led skill cards, and an expandable same-repository skill menu.
Reason: These surfaces should make the primary content and next action obvious without oversized decorative elements or duplicated status text.

Decision: Migration cards place a same-scale type icon before the skill name, expose its meaning through a tooltip, let the path row fill the available width, and place all corrective actions at the upper right.
Reason: The card should communicate the source shape at the point where the skill identity is read, while keeping every next action close to the relevant heading instead of separating actions across the card.

Decision: Store skill cards use natural content height with explicit bottom padding; their bottom metadata row has a minimum height matching the same-repository action; ranking tabs remain compact and the search field fills the remaining toolbar width.
Reason: The store should show more results at a glance without leaving large blank regions or visually oversized controls.

Decision: Store security-audit failures are represented by a red warning icon beside the audit heading, with the detailed warning exposed through a tooltip instead of a full-width alert below the audit cards.
Reason: Audit problems remain discoverable without interrupting the detail flow or adding a large block of repeated status text.
