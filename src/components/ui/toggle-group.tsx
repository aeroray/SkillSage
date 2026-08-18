import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { toggleVariants } from "./toggle";

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({ size: "default", variant: "default" });

function ToggleGroup({ className, variant, size, spacing = 2, orientation = "horizontal", children, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof toggleVariants> & { spacing?: number; orientation?: "horizontal" | "vertical" }) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn("flex w-fit flex-row items-center gap-2 rounded-lg data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch", className)}
      data-orientation={orientation}
      data-size={size}
      data-slot="toggle-group"
      data-variant={variant}
      orientation={orientation}
      style={{ "--toggle-group-gap": `${spacing * 0.25}rem` } as React.CSSProperties}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({ className, children, variant = "default", size = "default", ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);
  return <ToggleGroupPrimitive.Item className={cn(toggleVariants({ variant: context.variant || variant, size: context.size || size }), className)} data-slot="toggle-group-item" {...props}>{children}</ToggleGroupPrimitive.Item>;
}

export { ToggleGroup, ToggleGroupItem };
