import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2,
  CircleAlert,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";

import { cn } from "../../lib/utils";
import {
  ToastContext,
  type ToastOptions,
  type ToastVariant,
} from "./toast-context";

type ToastItem = ToastOptions & {
  id: number;
};

let nextToastId = 0;

const variantStyles: Record<ToastVariant, string> = {
  error: "border-destructive/30 bg-card text-destructive",
  info: "border-border bg-card text-foreground",
  success: "border-success/30 bg-card text-foreground",
  warning: "border-warning/30 bg-card text-foreground",
};

const variantIcons = {
  error: CircleAlert,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
} satisfies Record<ToastVariant, typeof Info>;

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const Icon = variantIcons[item.variant ?? "info"];

  useEffect(() => {
    const timer = window.setTimeout(
      () => onDismiss(item.id),
      item.duration ?? 3600,
    );
    return () => window.clearTimeout(timer);
  }, [item.duration, item.id, onDismiss]);

  return (
    <div
      aria-live={item.variant === "error" ? "assertive" : "polite"}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-[toast-in_180ms_ease-out]",
        variantStyles[item.variant ?? "info"],
      )}
      role={item.variant === "error" ? "alert" : "status"}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0",
          item.variant === "success" && "text-success",
          item.variant === "warning" && "text-warning",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="mt-0.5 break-words text-sm text-muted-foreground">
          {item.description}
        </p>
      </div>
      <button
        aria-label="关闭通知"
        className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onClick={() => onDismiss(item.id)}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const item = { ...options, id: ++nextToastId };
    setItems((current) => [...current.slice(-3), item]);
  }, []);

  const contextValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <div className="flex w-full max-w-[420px] flex-col gap-2">
          {items.map((item) => (
            <div className="pointer-events-auto" key={item.id}>
              <ToastCard item={item} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
