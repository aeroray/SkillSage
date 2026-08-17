import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ScrollArea } from "./scroll-area";

type DialogProps = {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function Dialog({ children, description, onClose, open, title }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <button
            aria-label="关闭详情"
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <ScrollArea className="max-h-[min(70vh,720px)]">
          <div className="px-6 py-6">{children}</div>
        </ScrollArea>
      </div>
    </div>,
    document.body,
  );
}
