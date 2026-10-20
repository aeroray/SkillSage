# Area: UI

Memory here applies only when touched files or task scope match this area.

## MC-CON-20261020-4deac65e — Four type steps, no arbitrary sizes

Status: active
Scope: area:ui
Subject: MC-SUBJ-20261020-c597330c
Facet: interface

Evidence:
- repo:src/index.css

Constraint:
The type ramp is exactly `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px, dialog titles only), plus mono at 12px for paths/hashes/versions. Never use an arbitrary size (`text-[0.8rem]`, `text-[13px]`): `cn` runs tailwind-merge, so an arbitrary size silently *replaces* a component's base size rather than layering on it. Font weights stay at 400/500/600.

## MC-CON-20261020-265be136 — Only two shadow tokens exist

Status: active
Scope: area:ui
Subject: MC-SUBJ-20261020-c597330c
Facet: data-model

Evidence:
- repo:src/index.css

Constraint:
Only `shadow-sm` (cards) and `shadow-lg` (overlays) exist. Any other `shadow-*` falls through to Tailwind's hardcoded black, which does not track the theme.

## MC-CON-20261020-bf4160ea — Overlays never use backdrop-filter

Status: active
Scope: area:ui
Subject: MC-SUBJ-20261020-c597330c
Facet: performance

Evidence:
- repo:src/components/ui/dialog-primitives.tsx

Constraint:
The scrim is `bg-black/45` (`dark:bg-black/70`) only. A full-viewport `backdrop-filter` is promoted to its own compositor layer, and tearing one down can flash a frame in Chromium/WebView2 — which the store's detail dialog triggers by closing the moment an install finishes. `DialogOverlay` and the AlertDialog overlay must stay identical.

## MC-CON-20261020-337f17b5 — The themed background is painted on html

Status: active
Scope: area:ui
Subject: MC-SUBJ-20261020-c597330c
Facet: lifecycle

Evidence:
- repo:src/index.css

Constraint:
The themed background must be on `html`, not only `body`. With only `body` set, `html` and `#root` are transparent, the root canvas keeps the UA default white, and any frame the compositor rebuilds from it flashes white in dark mode.
