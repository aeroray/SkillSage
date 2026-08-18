import type { ReactNode } from "react";
import {
  Dialog as DialogPrimitive,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog-primitives";
import { ScrollArea } from "./scroll-area";

type DialogProps = {
  children: ReactNode;
  description?: string;
  headerActions?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function Dialog({ children, description, headerActions, onClose, open, title }: DialogProps) {
  return (
    <DialogPrimitive onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-4 border-b border-border px-6 py-5 pr-12">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <DialogTitle className="min-w-0 truncate text-lg font-semibold tracking-tight">{title}</DialogTitle>
              {headerActions ? <div className="flex shrink-0 items-center">{headerActions}</div> : null}
            </div>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
        </DialogHeader>
        <ScrollArea className="min-h-0 max-h-[calc(100vh-7rem)]" type="auto">
          <div className="px-6 py-6">{children}</div>
        </ScrollArea>
      </DialogContent>
    </DialogPrimitive>
  );
}
