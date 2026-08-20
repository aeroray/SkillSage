import { createContext, useContext } from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastOptions = {
  description: string;
  title: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastContextValue = {
  toast: (options: ToastOptions) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
