# Area: UI Components

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-5f023ae9 — One shell, two semantics for overlays

Status: active
Scope: area:ui-components
Subject: MC-SUBJ-20261020-c597330c
Facet: architecture

Evidence:
- repo:src/components/ui/dialog-shell.ts

Constraint:
`dialog-shell.ts` is the single source of overlay appearance; `Dialog` and `ConfirmDialog` both compose it. Overlays use the app's own band rhythm `px-5 py-4`, never a scale of their own — do not pass `contentClassName` to override a dialog's padding. The close button is `absolute top-2.5 right-2.5`, tuned to the `py-4` header.

## MC-CON-20261020-71953d5b — Component size follows its container

Status: active
Scope: area:ui-components
Subject: MC-SUBJ-20261020-c597330c
Facet: adoption-policy

Evidence:
- repo:src/components/ui/button.tsx

Constraint:
Controls are always smaller than the container they sit in: title bar and chip rows use `xs`/`icon-xs` (28px), cards and toolbars `sm` (32px), page primary actions `default` (36px). A component that renders text declares its own size at the step it actually renders. Do not carry the shadcn `text-base md:text-sm` pair — the window never goes under 1200px, so `md:` always wins and `text-base` is dead.

## MC-CON-20261020-4c1effeb — One fixed name for the shared directory

Status: active
Scope: area:ui-components
Subject: MC-SUBJ-20261020-c597330c
Facet: version-policy

Evidence:
- repo:docs/DESIGN.md

Constraint:
The shared skills directory is called the "shared directory" in all user-facing copy, including Settings labels, badges, and tooltips. Do not reintroduce the older competing terms — the concept once had four names and the UI must use exactly one.

## MC-CON-20261020-b46b7752 — Components come from the installed primitives

Status: active
Scope: area:ui-components
Subject: MC-SUBJ-20261020-c597330c
Facet: workflow

Evidence:
- repo:src/components/ui/button.tsx

Constraint:
Pages use the installed shadcn/Radix primitives for controls and overlays — no page-level native selects, details menus, or custom component CSS classes. All scrollable content uses the shared `ScrollArea` abstraction rather than native `overflow-auto`. Tailwind v4 with CSS-first tokens is the active version.
