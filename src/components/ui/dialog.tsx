import type { ReactNode } from "react";
import {
  Dialog as DialogPrimitive,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog-primitives";
import { ScrollArea } from "./scroll-area";
import { cn } from "@/lib/utils";
import {
  DIALOG_BODY,
  DIALOG_DESCRIPTION,
  DIALOG_FOOTER,
  DIALOG_HEADER,
  DIALOG_SIZES,
  DIALOG_TITLE,
  type DialogSize,
} from "./dialog-shell";

type DialogProps = {
  children: ReactNode;
  contentClassName?: string;
  description?: string;
  descriptionHidden?: boolean;
  /** Action row, rendered in a bordered footer. Without it the dialog has no
   * footer at all rather than an empty one. */
  footer?: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: DialogSize;
  title: string;
};

/** The standard modal. Takes its frame, header, body and footer styling from
 * `dialog-shell`, so every dialog in the app shares one surface definition.
 *
 * `footer` exists because the previous version had none: each caller hand-wrote
 * a `flex justify-end gap-2` row with its own padding, which is exactly how the
 * button rows drifted apart.
 */
export function Dialog({
  children,
  contentClassName,
  description,
  descriptionHidden = false,
  footer,
  headerActions,
  onClose,
  open,
  size = "default",
  title,
}: DialogProps) {
  return (
    <DialogPrimitive
      onOpenChange={(nextOpen: boolean) => !nextOpen && onClose()}
      open={open}
    >
      <DialogContent className={cn(DIALOG_SIZES[size])}>
        <DialogHeader className={DIALOG_HEADER}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <DialogTitle className={DIALOG_TITLE}>{title}</DialogTitle>
              {headerActions ? (
                <div className="flex shrink-0 items-center">{headerActions}</div>
              ) : null}
            </div>
            {description ? (
              <DialogDescription
                className={cn(
                  DIALOG_DESCRIPTION,
                  descriptionHidden && "sr-only",
                )}
              >
                {description}
              </DialogDescription>
            ) : null}
          </div>
        </DialogHeader>
        <ScrollArea className="min-h-0" type="auto">
          <div className={contentClassName ?? DIALOG_BODY}>{children}</div>
        </ScrollArea>
        {footer ? <div className={DIALOG_FOOTER}>{footer}</div> : null}
      </DialogContent>
    </DialogPrimitive>
  );
}
