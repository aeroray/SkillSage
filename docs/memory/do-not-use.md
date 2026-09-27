# Do Not Use

## Multi-tool symlink/junction distribution + tool detection/registry (removed 2026-08-20)

Do not reintroduce: a private central repository (`~/.skillsage/remote|local`) that gets
fanned out via symlinks (macOS) or directory junctions (Windows) into a hardcoded registry
of per-tool skill directories (`core/tools/registry.rs`'s old 5-tool `TOOLS` table:
`.claude/skills`, `.cursor/skills`, `.github/skills`, `.codex/skills`,
`.config/opencode/skills`), with a `detect_tools` command checking which ones exist on
disk, `SkillLockRecord.distributed_to: Vec<String>` tracking which tools a skill is linked
into, and "adjust/batch distribution" commands to add/remove links after install.

**Why it was rejected:** the whole design rested on "skills exist only in the private
directory, projected via links only into user-selected tool directories; other tools
cannot read them" (the old requirements' original minimum-privilege principle). Investigation
found this isolation doesn't hold in practice — other AI tools already read from shared
locations (notably `~/.agents/skills/`, which this very codebase already referenced as a
migration-scan source) regardless of which tool-specific directory SkillSage links into.
Maintaining platform-specific symlink/junction/conflict/takeover machinery in service of a
guarantee that doesn't actually hold was pure complexity with no real benefit. See
`docs/memory/decisions.md`'s "2026-08-20 - Single shared public-directory install model"
entry for the replacement design (direct install into `~/.agents/skills/`, no tool
concept at all).

## What is still forbidden from that model

The 2026-09-24 registry (see `decisions.md`) restores a *declarative* tool list and per-tool
links, but it does **not** restore the parts that made the old model wrong. Still do not
reintroduce:

- A private central repository, or any model where the shared directory is not the one
  real copy of a skill.
- Link-based isolation, or any claim that a tool cannot see a skill.
- A per-tool conflict/takeover transaction. Path conflicts stay single-path
  (skip/takeover/cancel) against the shared directory only.
- Copying skill content into a tool directory. Links only.
- Hardcoding a tool list in more than one place. `core/tools.rs` is the only registry; the
  frontend receives it from the backend and must not name a tool itself.
- A tool path that no vendor documentation supports. Every entry carries a `source` URL and
  a `verified` flag; an unverified entry must say so in the UI rather than present a guess
  as fact.
- Restoring the two-boolean `claudeDistributed` / `workbuddyDistributed` representation.
  Distribution is a `distributedTo` list of registry ids.

## Historical specification files retired

Do not recreate or rely on the deleted `docs/specs/` or
`design-system/skillsage/MASTER.md` files as current specifications. Use source, tests,
the README, the QA guide, and active project memory instead.
