# Gemini Instructions

This project uses MemoryCustodian for durable project memory.

Before substantial work, read `docs/memory/manifest.md` and `docs/memory/brief.md`, then load only task-specific files allowed by the manifest. Check `docs/memory/do-not-use.md` before planning or implementation.

Do not import project memory files from this entry point; read them directly when the task requires them. Do not load `docs/memory/inbox.md` or `docs/memory/archive/` unless maintaining memory or explicitly asked.

If the memory directory exists without `manifest.md`, report an incomplete setup and do not infer routes.
