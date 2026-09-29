# Decisions

## 2026-09-29 - Four type steps, no arbitrary sizes

Decision: The type ramp is exactly four steps — 12px (`text-xs`), 14px (`text-sm`), 16px (`text-base`), 18px (`text-lg`, dialog titles only) — plus mono at 12px for paths, hashes and versions. No arbitrary sizes anywhere.
Reason: The ramp had drifted to five values because `ToggleGroupItem`'s `size="sm"` carried `text-[0.8rem]` (12.8px). That value sits on no documented step, and because `cn` runs tailwind-merge it *replaced* the base `text-sm` rather than layering on it, so every filter chip rendered at 12.8px while the 12px label immediately to its left did not — the chip looked larger than its own label, which is the "不协调" that prompted the audit. Measured across `/skills`, `/store` and `/settings` before the fix: 12, 12.8, 14, 16px. After: 12, 14, 16px. A rule rather than a cleanup, because the failure mode is invisible in review — the class string looks reasonable and only the cascade order reveals it. The `DialogTitle` primitive's own `text-base` was removed for the same reason: the dialog surface owns the title size, and two declarations meant whichever tailwind-merge saw last silently won.

## 2026-09-29 - Whole-library update checks pass their ids explicitly

Decision: `checkAllUpdates` passes the remote skill ids to `checkUpdatesNow` instead of calling it with no arguments.
Reason: With no ids the backend defaulted to "every record", but the hook's `checkingIds` stayed empty, so no row could render its checking state — the only feedback was the button label changing to the easily missed "检查中". Passing the ids makes every remote row show the same per-skill spinner that a single-row check shows. The list is identical to what the backend would have checked anyway (it skips records with no remote source), so this changes visibility, not work.

## 2026-09-27 - Distribution filtering: the tools are the control

Decision: The "分发" row renders one clickable badge per installed tool. Selecting several is a union, and a single "反选" toggle inverts the result. `SkillDistributionFilter` is `{ toolIds, inverted }`.
Reason: Two earlier designs were rejected during the build, and the reasons are worth keeping. A dropdown of tools paired with four outcome chips (任一 / 全部 / 均无 / 部分) made the user name the question before asking it — "distributed to any" and "distributed to none" are only meaningful once the user has already decided that "all" and "missing" are not what they meant. Reducing that to two complementary chips (已全部分发 / 有未分发) then dropped the user straight into whichever was usually empty as soon as a tool was picked, and an empty list reads as a broken filter rather than a truthful answer. Making the tools themselves the control shows what can be filtered by, needs no mode to be chosen, and leaves inverting as a property of the whole selection rather than a third thing to pick. An empty `toolIds` never filters, in either direction, so clearing the selection always restores the full list; the invert toggle is hidden until something is selected, since inverting nothing means every skill and so says nothing. The badge row scrolls horizontally with `no-scrollbar` because a visible track would compete with the badges beside it.

## 2026-09-27 - Opening a missing directory falls back to its nearest existing ancestor

Decision: `open_path` opens the nearest existing ancestor when the requested directory is absent, and returns `{ opened, exact }` so the caller can name the folder that was actually shown. It never creates the missing directory.
Reason: A tool that has never been used has no `skills/` directory of its own — Cline's registry entry is `.cline/skills`, and `~/.cline` exists while `~/.cline/skills` does not — so "打开目录" did nothing at all and read as a broken button. Creating the directory instead was rejected: `ToolResolver::detected` treats the skills directory *or its parent* existing as the signal that a tool is installed, so creating one would make an uninstalled tool report itself as installed and appear in every skill row. `open_skill_directory` stays strict, because an installed skill's directory is expected to exist and a fallback there would hide a broken install behind a plausible-looking folder.

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

## Phase 4 version and rollback strategy (superseded 2026-09-07)

Decision: A live store install resolves the repository default branch to a Git commit SHA before downloading files; updates record the previous commit/hash in `versionHistory`, snapshot the central skill directory, and atomically replace it. Rollback first fetches the requested commit and falls back to the matching local snapshot when the remote is unavailable.
Reason: Commit SHAs make update checks deterministic, while snapshots keep rollback usable during transient network failures.

## Skill update metadata without rollback history

Decision: SkillSage keeps only the current remote Git revision and content hash for update checks and sync reconstruction; it no longer stores version history, snapshots, or exposes rollback.
Reason: Skill rollback is out of scope, while the current revision remains necessary to identify remote content for updates and metadata-only sync import.

## Phase 4 management writes

Decision: Update, uninstall, distribution adjustment, and batch distribution remain Rust-owned commands behind the shared `AppState` async write lock; read-only listing and update checks do not take that lock.
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

## 2026-08-18 - Phase 7 observability and product boundary

Decision: The app writes normal logs and tracing output; global application cleanup is not part of the user-facing product surface.
Reason: The shared public-directory model makes a global cleanup action unnecessarily risky; users can remove individual skills explicitly.

Decision: Tauri writes normal logs and a tracing subscriber stream to the platform app log directory in every build profile.
Reason: User feedback needs actionable diagnostics without exposing GitHub credentials.

## 2026-08-18 - Review hardening

Decision: Managed repository roots, lock/settings files, imported trees, and distribution links reject symlink-like paths unless the path is an explicitly owned link being removed.
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

Decision: Settings uses a fixed desktop two-column card grid at the 1200px minimum, grouping security/appearance and about/update/device sync; there is no stop-management section.
Reason: This reduces unused vertical space while keeping related settings scannable and isolating destructive actions.

## 2026-08-18 - Stop-management flow wording

Decision: The Settings page does not expose a “停止管理” or global cleanup module. Removing the app does not modify the shared skill directory; individual uninstall remains on the installed-skills page.
Reason: SkillSage installs real files into a shared directory, so app removal and skill deletion must remain separate actions.

## 2026-08-18 - Installed skills management surface

Decision: The installed-skills page presents one “手动导入” menu for local import and GitHub URL installation, plus rescan, in the top-right. Filters, selection, batch actions, and author groups share one management panel; the master selection checkbox exposes an indeterminate state when only part of the filtered result is selected.
Reason: The toolbar stays focused on operations for the installed-skills directory, while store browsing remains a primary navigation destination.

Decision: The installed-skills list replaces opaque commit and fingerprint metadata with a compact Claude Code distribution status.
Reason: Users need the availability state more readily than internal revision identifiers, without adding a second explanatory line to every row.

Decision: Toggling Claude Code distribution updates the affected installed-skill row and shared cache in place instead of refreshing the whole list.
Reason: Distribution is a local state change and should complete without a page-wide loading flash.

Decision: Store installs automatically attempt to create the managed Claude Code compatibility link after the shared skill directory is installed.
Reason: Newly installed skills should be immediately available to Claude Code without requiring a second manual distribution action.

## 2026-08-18 - Selection-scoped update checks

Decision: The installed-skills “检查更新” action is enabled only when skills are selected and checks exactly those selected skill IDs; the page's initial refresh and lifecycle refreshes may still check all installed skills.
Reason: Batch operations should share one predictable selection scope instead of silently operating on the entire repository.

## 2026-09-11 - Batch skill updates

Decision: Installed-skill management offers a batch update action for currently detected updates, runs the existing per-skill update pipeline sequentially, continues after individual failures, and reports the aggregate result.
Reason: Users can update several known out-of-date skills without repeating the same action while retaining each skill's existing safety and error handling.

## 2026-09-11 - Adopt refreshes installed skills

Decision: A successful adopt operation refreshes both the adopt scan and the shared installed-skill cache before users return to management.
Reason: Newly adopted skills should appear immediately without requiring a second manual scan on the installed-skills page.

## 2026-08-18 - Migration and store visual hierarchy

Decision: Migration results use compact single-line path fields, explicit right-side action panels for manual/invalid items, and no redundant pending-count badge. Store browsing uses left-aligned colored ranking tabs, a right-aligned search field, text-led skill cards, and an expandable same-repository skill menu.
Reason: These surfaces should make the primary content and next action obvious without oversized decorative elements or duplicated status text.

Decision: Migration cards place a same-scale type icon before the skill name, expose its meaning through a tooltip, let the path row fill the available width, and place all corrective actions at the upper right.
Reason: The card should communicate the source shape at the point where the skill identity is read, while keeping every next action close to the relevant heading instead of separating actions across the card.

Decision: Store skill cards use natural content height with explicit bottom padding; their bottom metadata row has a minimum height matching the same-repository action; ranking tabs remain compact and the search field fills the remaining toolbar width.
Reason: The store should show more results at a glance without leaving large blank regions or visually oversized controls.

Decision: Store skill-card hover states use a subtle background and border transition without translation or shadow elevation.
Reason: Keep the card grid visually stable and prevent repeated hover feedback from becoming heavier than the content.

Decision: Store cards hide the description once a skill is installed; uninstalled cards keep it as a discovery aid.
Reason: Installed-state cards should stay compact and visually consistent while new skills retain enough context for evaluation.

Decision: Store security-audit failures are represented by a red warning icon beside the audit heading, with the detailed warning exposed through a tooltip instead of a full-width alert below the audit cards.
Reason: Audit problems remain discoverable without interrupting the detail flow or adding a large block of repeated status text.

Decision: Store detail installation progress is shown inside the primary install button with a loading icon and current stage label; separate progress text and badges are omitted.
Reason: One compact status target keeps installation feedback visible without competing with the detail content.

Decision: Installed-skill menus omit the Claude distribution summary label; local and built-in skills omit remote update actions, while remote skills expose a current-skill “检查更新” action and show “更新” only when available.
Reason: Keep menus focused on actionable operations without implying that local content has a latest version.

## 2026-08-20 - Explicit remote matching for local skills

Decision: A `local://` installed skill may be explicitly matched to a validated skills.sh/GitHub candidate from its row menu. Matching verifies candidate current content against the local directory fingerprint, ranks exact matches first, and returns the verification state plus repository metadata. Linking updates only the lock record's remote metadata and preserves the existing local directory and content hash; it does not download or replace files.
Reason: Skills installed by CLI or copied into the shared directory should be able to enter the existing update chain without silently changing local content. A name match is not proof of identical contents, while an exact current-directory fingerprint is strong evidence and gives the user a fast, explainable recommendation. Search and linking remain user-triggered.

## 2026-09-11 - Bounded local-skill source matching

Decision: Local matching first verifies compatible NPX lock provenance, otherwise checks only the top three deduplicated store candidates and expands to twenty only on request. Strict normalized description equality and install-count dominance may stop candidate expansion, while only full content hashes count as exact matches; session caches prevent repeated searches and verification.
Reason: This preserves explicit verification while avoiding broad GitHub request bursts for common skill names and older local copies.

## 2026-09-11 - Byte-safe remote skill content

Decision: Download, materialize, and hash remote skill files as raw bytes; decode only `SKILL.md` as UTF-8 when parsing its manifest.
Reason: Skills can include binary assets such as PNG files, which must not make installation, updates, or content verification fail.

## 2026-08-20 - Single shared public-directory install model (supersedes per-tool distribution)

Decision: Skills no longer install into a private central repository (`~/.skillsage/{remote,local}`) and get distributed to a general tool registry. Every skill installs as real content directly into `~/.agents/skills/<name>/`; Claude may separately receive a managed compatibility link. This supersedes the old central-repository, supported-tools, and Windows-link decisions.
Reason: Investigation found the promised per-tool isolation doesn't hold in practice — other AI tools already read from shared locations (this exact `~/.agents/skills/` path was already referenced in this codebase as a migration-scan source) regardless of whether SkillSage links into their own directory. Maintaining platform-specific symlink/junction/conflict/takeover machinery in service of an isolation guarantee that doesn't actually hold added real complexity and attack surface for no real benefit.

Decision: Tool detection, the 5-tool registry, and general "adjust distribution"/"batch distribution" functionality remain removed; only the explicit Claude Code and Work Buddy compatibility links are supported per skill.
Reason: Claude needs a separate readable path, but a narrow adapter avoids recreating a general tool-management subsystem.

Decision: `~/.skillsage/` contains only the lock file, tmp, and settings — never skill content or version snapshots. `SkillLockRecord.distributed_to` is removed; `RepoLayout` gained `public_root` and one flat `skill(name)` accessor replacing the owner-namespaced `remote_skill()`/flat `local_skill()` split.
Reason: Keeps the private directory's purpose to "our own bookkeeping," matching the new single-content-location model.

Decision: Clean-slate cutover — no automatic migration of existing `~/.skillsage/` content or old per-tool symlinks. The lockfile format version bumped to 2; a pre-cutover (version 1) lock file is treated as absent rather than partially parsed. Old data is left on disk, untracked.
Reason: This is an early-stage product; a real migration path wasn't worth the complexity it would add.

Decision: Installing into a name already occupied by an untracked foreign directory/link asks skip / takeover / cancel (one shared `PathConflictDialog`, not a per-tool conflict list); takeover renames the foreign entity aside (`<name>.skillsage-backup-<timestamp>`) and never deletes or adopts it in place. A name already owned by a _tracked_ record is a separate, harder `NameConflict` — not takeover-eligible, since renaming aside another tracked record would orphan its lock entry.
Reason: Preserves the app's existing non-destructive safety habits with much less code than the old per-tool `TakeoverTransaction` (no more `unique_name()` auto-numbering, no link rebuild, no SKILL.md-parse-and-validate on the displaced content).

Decision: The Migrate feature is replaced by "Adopt" — scanning only the public directory for untracked real directories with a valid SKILL.md, and registering them in place after the folder agrees with the SKILL.md declared name. The declared name is authoritative; a mismatch can be resolved by an explicit safe folder rename, and an invalid safe directory can be removed. Cross-tool lock-sniffed provenance recovery (`classifier.rs`) is kept, but only trusted after re-fetching the guessed commit and confirming a matching content hash — otherwise the adopted skill records as an unversioned `local://` source.
Reason: Adoption no longer needs to move content during registration, while the explicit rename makes the name shown to AI tools canonical and the explicit invalid-entry removal handles abandoned directories without hiding destructive behavior.
Note: the Rust module path and Tauri command names (`core/migrate/`, `scan_migrate`, `execute_migrate`) were kept as-is for minimal churn; the frontend presents this to users as "采纳技能" / Adopt.

Decision: The individual skill uninstall action deletes the real folder every AI tool reads from directly, not a disposable link; there is no global cleanup command.
Reason: A single-skill confirmation can explain the blast radius while avoiding a broad app-level deletion control.

## 2026-08-26 - Claude compatibility distribution

Decision: A skill can optionally link from `~/.claude/skills/<name>` to its real `~/.agents/skills/<name>` directory; Windows uses a junction and macOS uses a symlink, and uninstall removes the owned link first.
Reason: Claude currently does not read the shared directory, while a link preserves one skill copy and keeps removal safe.

## 2026-09-15 - Work Buddy compatibility distribution

Decision: A skill can optionally link from `~/.workbuddy-ai/skills/<name>` to its real `~/.agents/skills/<name>` directory, with an independent per-skill UI toggle alongside Claude Code.
Reason: Work Buddy uses a separate local skill root, while explicit adapters preserve one shared copy without reintroducing a general tool registry.

## 2026-09-24 - Declarative tool registry replaces the two hardcoded adapters

Decision: A skill installs once into the shared directory, and is then linked into the directory of each **detected** tool that does not read that shared directory. The set of tools is a built-in registry (`core/tools.rs`) of ~27 entries, each carrying its skills directory, whether it reads the shared directory, the documentation URL the entry came from, and whether that source is vendor documentation or a third-party table.
Reason: The previous two hardcoded adapters (Claude Code, Work Buddy) could not answer "which tools does this machine actually have", and shipped a Work Buddy path (`~/.workbuddy-ai/skills`) that does not exist — so an uninstalled tool kept appearing as a valid distribution target. A registry with a per-tool source URL makes a wrong entry checkable instead of guessed.

Decision: Whether a tool reads the shared directory is a **user-overridable setting**, not a compile-time constant.
Reason: Tools gain shared-directory support over time. Claude Code currently does not read `~/.agents/skills/` while Cursor, Copilot, OpenCode, Amp, Gemini CLI, Windsurf/Devin, Droid, Roo Code and Zed do — and that list changes. A user who finds their tool now reads the shared directory can turn distribution off without waiting for a release.

Decision: Turning on "reads the shared directory" for a tool removes the now-redundant links for that tool, and the tool drops out of the per-skill distribution list. The backend refuses to create a link for a tool marked as reading the shared directory.
Reason: The two states are mutually exclusive; keeping a link would duplicate the skill and contradict the setting the user just changed.

Decision: The per-skill distribution list is stored as `distributedTo: Vec<String>` of tool ids, replacing the `claudeDistributed` / `workbuddyDistributed` booleans, and is recomputed from the filesystem on every read rather than trusted from the lock file.
Reason: The directory is the source of truth — a link removed outside the app must stop being reported — and a list can express any registry size where two booleans could not. The lock format version is now 3; a version 2 file is migrated in place by folding its flags into the list, and a version 1 file is still treated as absent.

Decision: The distribution UI shows only tools detected on this machine, plus any that already hold a link for that skill. Settings lists the whole registry.
Reason: The registry has ~19 tools that need a link. Showing all of them per skill row would bury the two or three that matter; showing them all in the sidebar would make the card taller than the window.

Decision: Links left in `LEGACY_SKILLS_DIRS` (the old `.workbuddy-ai/skills`) are removed at startup, but only when they point back into the shared directory, and the emptied folder is deleted.
Reason: Those links pointed at a directory no tool reads, which is precisely why an uninstalled tool still looked available. Restricting removal to links that resolve inside the shared directory means an unrelated entry in a leftover folder is never deleted.

## 2026-09-27 - Mirror responses must be cache-busted

Decision: Every manifest and release-metadata request carries a unique `skillsage=<nanos>` query token, and the winning hit's token is reused for the updater plugin's own fetch via `ManifestHit::endpoint()`.
Reason: Mirrors sit behind CDNs that cache `latest.json`, and a cache hit is *faster* than a fresh fetch — so ranking sources by response time systematically prefers stale data. This was not theoretical: minutes after v1.0.3 was published, the fastest node in `MIRRORS` still served the v1.0.2 manifest on 4 of 4 attempts, and the simulated v1.0.3 race picked it, meaning an up-to-date-looking user would be told there was nothing to install. The token is reused for the plugin's fetch because the plugin re-fetches the manifest itself; dropping it there would reintroduce the same bug one layer down, with the race finding the new version and the plugin still reporting none. The metadata fetch is busted for the same reason — a stale copy lacks the asset id the fresh manifest just announced, which would silently fall the download back to a direct connection that cannot work in mainland China.

Decision: `tests/mirrors_live.rs` compares the raced manifest against GitHub's own `releases/latest` tag.
Reason: That endpoint has no CDN in front of it, so it is the one authority that can prove the race did not return stale data. A mock cannot catch this class of bug at all.

Decision: The published v1.0.3 was deleted and re-released from the fixed commit rather than superseded by a v1.0.4.
Reason: It had 0 downloads across all six assets, so re-tagging broke nobody, and shipping a known-broken v1.0.3 would have left its users unable to see the next update — the very failure the mirror work exists to fix. Deleting the tag removed the release and its assets together, with no orphans.

## 2026-09-27 - Release notes live in the repository, one file per tag

Decision: Release notes are authored in `docs/releases/<tag>.md`; `scripts/load-release-notes.mjs` reads the tag's file and exposes it as the workflow's `body` output, failing the job when the file is missing or empty. `generateReleaseNotes` is off.
Reason: The notes were previously inlined in `release.yml`'s `releaseBody`, so they had to be hand-edited for every release and — if that was forgotten — were reused verbatim, silently publishing the previous version's notes under the new tag. Nothing in the pipeline could catch it. Keeping one file per tag also makes the notes reviewable in the release commit rather than buried in workflow YAML.

Decision: The loader is Node, not a bash heredoc, even though the job runs on bash-capable runners.
Reason: The matrix includes `windows-latest`, where `$GITHUB_OUTPUT` is a Windows path and shell heredocs are the fragile part. Node also lets the delimiter collision and the missing-file case be checked before writing anything.

Decision: `generateReleaseNotes` is `false` now that a body is authored.
Reason: With an authored body GitHub would otherwise risk prepending an auto-generated commit list to it. The v1.0.2 release body was inspected to confirm only the authored text is published.

## 2026-09-27 - Mirror racing for the in-app updater

Decision: The update check and download race every configured GitHub mirror plus direct GitHub concurrently, and use whichever returns a valid manifest first. The list is `core/mirrors.rs`'s `MIRRORS`: `gh.catmak.name`, `cdn.akaere.online`, `fastgit.cc`, `githubdog.com`, `github.geekery.cn`, measured against the real manifest with a warm connection.
Reason: GitHub release downloads are frequently unreachable or very slow from mainland China, which made the update check fail outright rather than merely run slowly. These nodes are volunteer-run and disappear without notice, so pinning one would eventually break for every user at once; racing means a dead node costs nothing. Direct GitHub is raced alongside them so users outside China are never penalised.

Decision: The updater plugin supplies signature verification and the platform installer, but not endpoint selection. `core/mirrors.rs` picks the endpoint; `commands/update.rs` hands the plugin a single one.
Reason: The plugin walks its endpoint list *sequentially*, so on a network where the first endpoint hangs the user waits out the full timeout before the next is tried — the opposite of what a China-facing fallback chain needs.

Decision: Only the transport is ours. The plugin still verifies the minisign signature over the downloaded bytes against the configured public key.
Reason: Fetching the binary from a community mirror must not be able to substitute different content. A tampered mirror produces a signature failure, not an install.

Decision: A winning mirror's manifest is re-fetched by the plugin, but the asset URL inside it is rewritten from `api.github.com/.../releases/assets/<id>` onto the node's `releases/download/<tag>/<file>` form, resolved from the release metadata fetched through the same node. If the rewrite cannot be resolved, the original URL is kept.
Reason: Every node was verified to proxy the manifest but to leave the asset URL pointing at `api.github.com`, which most nodes then reject with 403/404 — so without this the check would succeed through a mirror and the download would fail. Falling back rather than erroring keeps direct downloads working, since a rewrite failure must not turn a working update into a broken one.

Decision: `MANIFEST_URL` must equal `plugins.updater.endpoints` in `tauri.conf.json`, enforced by the `manifest_url_matches_tauri_config` test.
Reason: If the two drifted, a mirror could serve a manifest for a different release than the plugin would have fetched directly.

Decision: The live node checks (`tests/mirrors_live.rs`) are `#[ignore]`d and run explicitly with `--ignored`.
Reason: They need network access and depend on third-party hosts that come and go, so they must not make the normal test run flaky — but the racing and the asset rewrite genuinely cannot be verified with a mock, because the whole question is what the real nodes do.

## 2026-08-20 - Historical specifications retired

Decision: Keep current product context in source, tests, README, QA guidance, and active memory; retire the historical `docs/specs/` and design-system master documents.
Reason: They duplicate current decisions or describe superseded architecture, so retaining them creates competing sources of truth.

## 2026-08-20 - Package version and Chinese product name

Decision: `package.json.version` is the sole app release version; Tauri reads it directly and Cargo metadata is synchronized by `pnpm sync:version`. The official Chinese product name is 技匠, shown with the SkillSage brand where appropriate.
Reason: One release field prevents version drift, while a stable bilingual identity keeps the app recognizable across installers, UI, and documentation.

## 2026-08-20 - English packaging identity

Decision: Keep `SkillSage` as Tauri's technical `productName` so installer filenames, bundle names, and default installation directories remain stable and ASCII-compatible. Use 技匠（SkillSage） for the visible product identity in the UI, titles, and documentation.
Reason: Chinese display branding should not make release assets lose their base name or create inconsistent installer paths.
