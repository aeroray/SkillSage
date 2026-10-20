# Area: Feedback

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-c2d3fdf3 — A status message never asserts an outcome that did not occur

Status: active
Scope: area:feedback
Subject: MC-SUBJ-20261020-39489ec9
Facet: behavior

Evidence:
- repo:src/pages/skills/SkillsPage.tsx

Constraint:
An empty result set is not "all up to date" and must not carry a success variant. `check_updates` swallows per-skill failures and returns only successes, so a short or empty result means the checks did not all run: report "no result obtained" with `info`, count returned results rather than requested ids, and say how many could not be checked.

## MC-CON-20261020-e57e25dc — Busy state is keyed by id

Status: active
Scope: area:feedback
Subject: MC-SUBJ-20261020-39489ec9
Facet: data-model

Evidence:
- repo:src/features/skills/hooks.ts

Constraint:
In-flight state the UI renders per row must be a `Map`/`Set` keyed by id, and its `finally` removes only its own entry — never a single slot cleared unconditionally. `useSkillManagement.pendingActions` and `useTools.savingIds` are the pattern.

## MC-CON-20261020-4d8a2e57 — An operation that closes its surface reports before closing

Status: active
Scope: area:feedback
Subject: MC-SUBJ-20261020-39489ec9
Facet: workflow

Evidence:
- repo:src/pages/store/StorePage.tsx

Constraint:
A write operation that closes its own surface reports its result first: `useSkillInstall` passes its `InstallResult` to `onCompleted` so the page names the installed skill. Radix's `AlertDialog.Action` closes synchronously, so a dialog that must stay open on failure sets `closeOnConfirm={false}`; hook error state is stale after `await`, so `useSkillManagement` exposes `getLastError()`.
