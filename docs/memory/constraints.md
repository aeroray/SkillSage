# Constraints

- Do not call `npx skills`; download, parse, install, update, distribute, and uninstall are Rust-owned.
- Windows distribution uses same-drive junctions; macOS uses symlinks. Copy mode is not supported.
- The application is desktop-only: the main window must open at 1200×800, never resize below 1200×800, and may be maximized; do not add mobile-specific layout requirements.
- Phase 1 must remain a shell: no live store API, installation pipeline, lockfile behavior, or settings persistence yet.
- UI uses Slate Blue primary colors, system fonts, CSS radius variables (`--radius`, `--radius-lg`), 4px spacing increments, `shadow-sm`/`shadow-lg` only, Lucide icons, and shadcn-style primitives.
- All scrollable UI content uses a shared ScrollArea abstraction; do not introduce native `overflow-auto` containers.
- Long-running write operations will later share one async lock; read-only operations may run concurrently.
- MemoryCustodian rules remain authoritative for loading, routing, budgets, compaction, and forgetting behavior.
- Phase 2's built-in fixture is intentionally offline; live skills.sh/GitHub installation belongs to the next store phase.
- Until token/settings support exists, do not depend on skills.sh `/api/v1`; it requires Vercel OIDC. Use the public legacy search and HTML store pages for Phase 3.
- Phase 4 remote update/rollback currently supports GitHub-backed skills.sh records only; the offline Phase 2 fixture is intentionally not updateable.
- Phase 5 local import accepts a `SKILL.md` file, a skill directory, or a directory containing exactly one immediate skill directory; symlinks are rejected and same-name remote records cannot be overwritten by local import.
- Phase 5 GitHub URL installation supports repository, tree, blob, and raw `SKILL.md` URLs; repository URLs enumerate candidate skills from the resolved Git tree.
- Phase 5 settings persist proxy configuration in `~/.skillsage/settings.json` and store the GitHub token in the OS keyring; request clients must receive both through the Rust settings layer.
- Frontend pages must use the installed shadcn/Radix primitives for controls and overlays; do not reintroduce page-level native selects, details menus, or custom component CSS classes.
- Tailwind v4 is the active frontend version; use the first-party Vite plugin and CSS-first theme tokens, and do not reintroduce a v3 PostCSS/config pipeline.
