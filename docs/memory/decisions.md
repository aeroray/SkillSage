# Decisions

## 2026-08-17 - Use local MemoryCustodian memory

Decision:
Store durable project memory in `docs/memory/` and route Codex, Claude Code, Gemini, generic agents, and GitHub Copilot through short platform entry files.
Reason:
This keeps project context local, inspectable, portable, and consistent across supported agent platforms.

## Product architecture

Decision: SkillSage uses Tauri 2 with a React/TypeScript frontend and a Rust backend; backend commands stay thin while domain logic lives in Tauri-independent Rust core modules.
Reason: This preserves testability and keeps desktop integration separate from reusable skill-management logic.

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
