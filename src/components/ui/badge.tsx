import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "muted" | "success";

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        {
          "bg-primary-soft text-primary": variant === "default",
          "bg-muted text-muted-foreground": variant === "muted",
          "bg-success/10 text-success": variant === "success",
        },
        className,
      )}
      {...props}
    />
  );
}
