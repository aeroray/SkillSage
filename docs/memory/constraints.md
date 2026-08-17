# Constraints

- Do not call `npx skills`; download, parse, install, update, distribute, and uninstall are Rust-owned.
- Windows distribution uses same-drive junctions; macOS uses symlinks. Copy mode is not supported.
- Phase 1 must remain a shell: no live store API, installation pipeline, lockfile behavior, or settings persistence yet.
- UI uses Slate Blue primary colors, system fonts, CSS radius variables (`--radius`, `--radius-lg`), 4px spacing increments, `shadow-sm`/`shadow-lg` only, Lucide icons, and shadcn-style primitives.
- All scrollable UI content uses a shared ScrollArea abstraction; do not introduce native `overflow-auto` containers.
- Long-running write operations will later share one async lock; read-only operations may run concurrently.
- MemoryCustodian rules remain authoritative for loading, routing, budgets, compaction, and forgetting behavior.
- Phase 2's built-in fixture is intentionally offline; live skills.sh/GitHub installation belongs to the next store phase.
- Until token/settings support exists, do not depend on skills.sh `/api/v1`; it requires Vercel OIDC. Use the public legacy search and HTML store pages for Phase 3.
