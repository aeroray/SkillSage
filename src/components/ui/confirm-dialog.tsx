import type { ReactNode } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { Button, type ButtonProps } from "./button";
import {
  DIALOG_BODY,
  DIALOG_DESCRIPTION,
  DIALOG_FOOTER,
  DIALOG_HEADER,
  DIALOG_SIZES,
  DIALOG_TITLE,
  type DialogSize,
} from "./dialog-shell";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  /** Optional detail below the description — a list of affected items, a path,
   * a warning. Rendered in the body, so the header stays one line of prose. */
  children?: ReactNode;
  /** Defaults to 取消. */
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirmLabel: string;
  /** `destructive` for anything that deletes or overwrites. */
  confirmVariant?: ButtonProps["variant"];
  description: ReactNode;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  size?: DialogSize;
  title: string;
};

/**
 * An interrupting confirmation: the user must choose, focus lands on cancel,
 * and clicking outside does not dismiss.
 *
 * It looks identical to `Dialog` because it composes the same shell constants —
 * the AlertDialog primitive is used for its behaviour, not for its appearance.
 * Previously these were hand-built per page with `p-4`, a centred `text-base`
 * title and a footer that escaped its own padding, which made a delete
 * confirmation look like a different product from a form dialog.
 */
export function ConfirmDialog({
  cancelLabel = "取消",
  children,
  confirmDisabled,
  confirmLabel,
  confirmVariant = "default",
  description,
  onConfirm,
  onOpenChange,
  open,
  size = "sm",
  title,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 isolate z-50 bg-black/45 backdrop-blur-[2px] dark:bg-black/70" />
        <AlertDialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-lg border border-border bg-popover p-0 text-sm text-popover-foreground shadow-lg outline-none",
            DIALOG_SIZES[size],
          )}
        >
          <div className={DIALOG_HEADER}>
            <div className="min-w-0 flex-1">
              <AlertDialogPrimitive.Title className={DIALOG_TITLE}>
                {title}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description
                className={DIALOG_DESCRIPTION}
              >
                {description}
              </AlertDialogPrimitive.Description>
            </div>
          </div>

          {children ? (
            <div className="min-h-0 overflow-y-auto">
              <div className={DIALOG_BODY}>{children}</div>
            </div>
          ) : null}

          <div className={DIALOG_FOOTER}>
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                disabled={confirmDisabled}
                onClick={onConfirm}
                variant={confirmVariant}
              >
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
