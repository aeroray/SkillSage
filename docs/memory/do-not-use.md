# Do Not Use

## Per-tool symlink/junction distribution + tool detection/registry (removed 2026-08-20)

Do not reintroduce: a private central repository (`~/.skillsage/remote|local`) that gets
fanned out via symlinks (macOS) or directory junctions (Windows) into a hardcoded registry
of per-tool skill directories (`core/tools/registry.rs`'s old 5-tool `TOOLS` table:
`.claude/skills`, `.cursor/skills`, `.github/skills`, `.codex/skills`,
`.config/opencode/skills`), with a `detect_tools` command checking which ones exist on
disk, `SkillLockRecord.distributed_to: Vec<String>` tracking which tools a skill is linked
into, and "adjust/batch distribution" commands to add/remove links after install.

**Why it was rejected:** the whole design rested on "skills exist only in the private
directory, projected via links only into user-selected tool directories; other tools
cannot read them" (`docs/specs/01-需求文档.md`'s original §8 principle 1). Investigation
found this isolation doesn't hold in practice — other AI tools already read from shared
locations (notably `~/.agents/skills/`, which this very codebase already referenced as a
migration-scan source) regardless of which tool-specific directory SkillSage links into.
Maintaining platform-specific symlink/junction/conflict/takeover machinery in service of a
guarantee that doesn't actually hold was pure complexity with no real benefit. See
`docs/memory/decisions.md`'s "2026-08-20 - Single shared public-directory install model"
entry for the replacement design (direct install into `~/.agents/skills/`, no tool
concept at all).

If a future need for genuine per-tool isolation resurfaces, treat it as a new problem to
design fresh — don't resurrect this implementation; it was removed on principle, not
just refactored.
