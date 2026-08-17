# Agent Instructions

This project uses MemoryCustodian for durable project memory.

Before substantial work:

1. Read `docs/memory/manifest.md`.
2. Read `docs/memory/brief.md`.
3. Classify the task and load only the files routed by the manifest.
4. Check `do-not-use.md` before planning or implementation.

Do not load `inbox.md` or `archive/` unless the task is memory maintenance or the user explicitly asks. Keep this entry point short; project context belongs in `docs/memory/`.

If `docs/memory/` exists without `manifest.md`, stop memory loading and report the setup as incomplete rather than inferring routes.
