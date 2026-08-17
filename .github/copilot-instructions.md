# GitHub Copilot Instructions

This project uses MemoryCustodian for durable project memory.

Before substantial work, read `docs/memory/manifest.md` and `docs/memory/brief.md`, then load only task-specific files routed by the manifest. Check `docs/memory/do-not-use.md` before planning or implementation.

Do not load `docs/memory/inbox.md` or `docs/memory/archive/` unless maintaining memory or explicitly asked. Keep this entry point short; project context belongs in `docs/memory/`.

If the memory directory exists without `manifest.md`, stop memory loading and report the setup as incomplete rather than inferring routes.
