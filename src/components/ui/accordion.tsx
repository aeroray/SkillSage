import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Accordion({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) { return <AccordionPrimitive.Root className={cn("flex w-full flex-col", className)} data-slot="accordion" {...props} />; }
function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) { return <AccordionPrimitive.Item className={cn("border-b border-border last:border-b-0", className)} data-slot="accordion-item" {...props} />; }
function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) { return <AccordionPrimitive.Header className="flex"><AccordionPrimitive.Trigger className={cn("flex flex-1 items-center justify-between rounded-md px-1 py-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40", className)} data-slot="accordion-trigger" {...props}>{children}<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180" /></AccordionPrimitive.Trigger></AccordionPrimitive.Header>; }
function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) { return <AccordionPrimitive.Content className="overflow-hidden text-sm data-[state=closed]:hidden" data-slot="accordion-content" {...props}><div className={cn("pb-2.5", className)}>{children}</div></AccordionPrimitive.Content>; }

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
