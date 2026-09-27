/**
 * The one visual definition of a modal surface.
 *
 * Two components render dialogs — `Dialog` (Radix Dialog) and `ConfirmDialog`
 * (Radix AlertDialog) — because they carry genuinely different semantics:
 * AlertDialog is for an interrupt that expects a decision, traps focus on the
 * least-destructive action, and does not close on outside click. That semantic
 * difference is worth keeping.
 *
 * What is *not* worth keeping is two different looks. Before this file, the
 * AlertDialog sites used `p-4` with a centred `text-base` title and a footer
 * that overhung its padding with negative margins, while the Dialog sites used
 * `px-6 py-6` with a left-aligned `text-lg` title and a hand-written button row
 * each. The same action looked like two different products depending on which
 * page you were on. Both now compose these constants, so the surface is defined
 * once and the semantics stay independent.
 */

/** Outer frame: one shadow, one radius, one border. `shadow-lg` is the
 * elevation token reserved for overlays (see DESIGN.md, 「浮层才投影」). */
export const DIALOG_CONTENT =
  "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg border border-border bg-popover p-0 text-sm text-popover-foreground shadow-lg outline-none";

/** Width steps. A confirm is narrow, a form is comfortable, a list is wide. */
export const DIALOG_SIZES = {
  sm: "max-w-sm",
  default: "max-w-2xl",
  lg: "max-w-4xl",
} as const;

export type DialogSize = keyof typeof DIALOG_SIZES;

/** Header: `pr-12` reserves the close button's corner so a long title cannot
 * run under it. */
export const DIALOG_HEADER =
  "flex flex-row items-start gap-4 border-b border-border px-6 py-5 pr-12";

export const DIALOG_TITLE =
  "min-w-0 truncate text-lg font-semibold tracking-tight";

export const DIALOG_DESCRIPTION = "mt-1 text-sm leading-6 text-muted-foreground";

/** Body. Scrolling lives here, never on the page behind it. */
export const DIALOG_BODY = "px-6 py-6";

/** Footer: the same action row in every dialog, so the primary button is
 * always bottom-right and the cancel is always to its left. */
export const DIALOG_FOOTER =
  "flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4";

/** A secondary footer slot, for a hint on the left of the action row. */
export const DIALOG_FOOTER_NOTE = "mr-auto text-xs text-muted-foreground";
