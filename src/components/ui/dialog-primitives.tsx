import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DIALOG_CONTENT, DIALOG_SIZES } from "@/components/ui/dialog-shell"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      // No `backdrop-filter`. A full-viewport blurred overlay is a promoted
      // compositor layer, and tearing one down is a known source of a one-frame
      // flash in Chromium/WebView2 — which is exactly what happens here, since
      // the store's detail dialog closes the moment an install finishes. The
      // blur was also decoration rather than a specific effect: DESIGN.md builds
      // overlays from a border and `shadow-lg`, and the scrim alone already
      // separates the dialog from the page behind it.
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/45 dark:bg-black/70",
        className
      )}
      {...props}
    />
  )
}

/**
 * The raw content frame. Sizing and padding come from `dialog-shell` via the
 * higher-level `Dialog`, so this stays deliberately free of layout opinions
 * beyond the shared frame — callers that need a different width pass a
 * `DIALOG_SIZES` value rather than inventing one.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(DIALOG_CONTENT, DIALOG_SIZES.default, className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              aria-label="关闭"
              variant="ghost"
              // `top-2.5`, not `top-3`: the button is 32px and the title is
              // 18px with `leading-none`, so at the header's `py-4` the two
              // centres align within 1px. At `top-3` the button sat 3px low.
              className="absolute top-2.5 right-2.5"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">关闭</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      // No font-size here. The dialog surface owns it (`DIALOG_TITLE` in
      // dialog-shell.ts) so every modal shares one title size; declaring a
      // second one here would silently win or lose depending on which the
      // tailwind-merge pass saw last.
      className={cn("leading-none font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
}
