import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) { return <SelectPrimitive.Root data-slot="select" {...props} />; }
function SelectGroup({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) { return <SelectPrimitive.Group className={cn("p-1", className)} data-slot="select-group" {...props} />; }
function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) { return <SelectPrimitive.Value data-slot="select-value" {...props} />; }

function SelectTrigger({ className, size = "default", children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: "sm" | "default" }) {
  return <SelectPrimitive.Trigger className={cn("flex h-9 w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 text-sm whitespace-nowrap outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground [&_svg]:size-4", size === "sm" && "h-8", className)} data-size={size} data-slot="select-trigger" {...props}>{children}<SelectPrimitive.Icon asChild><ChevronDownIcon className="pointer-events-none shrink-0 text-muted-foreground" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>;
}

function SelectContent({ className, children, position = "item-aligned", align = "center", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content align={align} className={cn("relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-36 overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg outline-none", className)} data-slot="select-content" position={position} {...props}><SelectScrollUpButton /><SelectPrimitive.Viewport className={cn("p-0.5", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")} data-position={position}>{children}</SelectPrimitive.Viewport><SelectScrollDownButton /></SelectPrimitive.Content></SelectPrimitive.Portal>;
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) { return <SelectPrimitive.Label className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)} data-slot="select-label" {...props} />; }
function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item className={cn("relative flex w-full cursor-default items-center gap-1.5 rounded-sm px-2 py-1.5 pr-8 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4", className)} data-slot="select-item" {...props}><span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><CheckIcon /></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>;
}
function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) { return <SelectPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} data-slot="select-separator" {...props} />; }
function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) { return <SelectPrimitive.ScrollUpButton className={cn("flex cursor-default items-center justify-center py-1 text-muted-foreground", className)} data-slot="select-scroll-up-button" {...props}><ChevronUpIcon /></SelectPrimitive.ScrollUpButton>; }
function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) { return <SelectPrimitive.ScrollDownButton className={cn("flex cursor-default items-center justify-center py-1 text-muted-foreground", className)} data-slot="select-scroll-down-button" {...props}><ChevronDownIcon /></SelectPrimitive.ScrollDownButton>; }

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue };
