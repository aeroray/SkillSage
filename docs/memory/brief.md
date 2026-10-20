# Project Brief

Purpose:
- SkillSage (Chinese product name: the two characters shown in the title bar) is a Tauri 2 desktop app for Windows and macOS that manages AI-agent skills. It installs skills from skills.sh, GitHub URLs, local folders, or sync packages into one shared directory (`~/.agents/skills/`), tracks them in a lock file, and links each skill into the directory of any detected tool that does not read that shared directory.

Current direction:
- Phase 1–7 are complete: store, installed-skill management, local/GitHub import, sync, adopt, per-tool distribution, and in-app updates all ship. The 2026-10-19 whole-tree review closed one critical and seven high findings; the durable rules from it live in `constraints.md`, and subsystem detail lives in `areas/`.

System shape:
- Rust backend under `src-tauri/src` (thin Tauri commands in `commands/`, testable domain logic in `core/`), React 19 + Vite + Tailwind v4 + shadcn/Radix + Zustand frontend under `src/`. Untrusted input arrives from HTTP (skills.sh HTML, GitHub API/raw, update mirrors), from skill manifests (`SKILL.md` YAML), and from local files and sync packages. The tool registry (`core/tools.rs`) is the single source of truth for tool paths; the frontend never names a tool itself.
