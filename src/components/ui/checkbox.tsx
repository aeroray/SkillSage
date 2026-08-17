import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        className,
      )}
      type="checkbox"
      {...props}
    />
  );
}
