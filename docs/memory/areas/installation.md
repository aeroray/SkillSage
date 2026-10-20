# Area: Installation

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-7d734c45 — The lock file is replaced by one rename

Status: active
Scope: area:installation
Subject: MC-SUBJ-20261020-c3c4ac80
Facet: lifecycle

Evidence:
- repo:src-tauri/src/core/repo/atomic.rs

Constraint:
Replace the lock file with a single `std::fs::rename` of the synced temp file over it. Never reintroduce a rename-aside-then-rename-in pair: the path briefly does not exist, `lockfile::load` maps `NotFound` to an empty file, and a crash there untracks every skill. `export_package` takes the write lock.

## MC-CON-20261020-0774ade3 — An empty sync selection means nothing

Status: active
Scope: area:installation
Subject: MC-SUBJ-20261020-c3c4ac80
Facet: behavior

Evidence:
- repo:src-tauri/src/core/sync/import.rs

Constraint:
A sync import's empty `selectedIds` means "nothing selected", never "everything". The dialog sends the full id list when it means all, and may legitimately submit with every box cleared to import only settings.

## MC-CON-20261020-a7420fe0 — Backup artifacts are never skills

Status: active
Scope: area:installation
Subject: MC-SUBJ-20261020-c3c4ac80
Facet: data-model

Evidence:
- repo:src-tauri/src/core/repo/atomic.rs

Constraint:
Code scanning a directory for skills must filter with `atomic::is_managed_artifact`, which matches both schemes: `{name}.skillsage-backup-{ts}-{pid}` and `.{name}.{dir,file}-backup-{pid}-{ns}`. A kept takeover backup now sits permanently in the shared directory.

## MC-CON-20261020-6c63e9d0 — Adopt repairs case-only name mismatches

Status: active
Scope: area:installation
Subject: MC-SUBJ-20261020-c3c4ac80
Facet: adoption-policy

Evidence:
- repo:src-tauri/src/core/migrate/scanner.rs

Constraint:
`rename_mismatch` compares canonicalized paths so a folder differing from its `SKILL.md` name only in case can be repaired on a case-insensitive filesystem. Two genuinely distinct entries at one name remain a `NameConflict`.

## MC-CON-20261020-a562a0b1 — One failed candidate must not hide the rest

Status: active
Scope: area:installation
Subject: MC-SUBJ-20261020-c3c4ac80
Facet: compatibility

Evidence:
- repo:src-tauri/src/core/github/tree.rs

Constraint:
Both `resolve_skills` and `find_skill_file_by_manifest` skip a candidate whose probe fails, log it, and only error when every candidate failed. `parser.rs`'s `validate_reference` must stay identical to `client.rs`'s.
