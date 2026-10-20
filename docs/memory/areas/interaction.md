# Area: Interaction

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-83ae899e — Dialogs clear every piece of state they render

Status: active
Scope: area:interaction
Subject: MC-SUBJ-20261020-39489ec9
Facet: lifecycle

Evidence:
- repo:src/pages/store/StorePage.tsx

Constraint:
Dialog close effects clear every piece of state the dialog renders, including hook-owned errors (`conflictCheck.clearError()`), and call the hook's `reset()` rather than a raw setter. Dialogs stay mounted while closed, so anything not cleared shows on the next open.

## MC-CON-20261020-d384a325 — External links go through the backend command

Status: active
Scope: area:interaction
Subject: MC-SUBJ-20261020-39489ec9
Facet: compatibility

Evidence:
- repo:src/lib/external-link.ts

Constraint:
External links open through the `open_external_url` command (https only, no credentials), never a renderer `target="_blank"` anchor: the WebView has no new-window handler and no opener plugin, so such an anchor is a dead button. The renderer check is fail-fast; the backend re-validates.
