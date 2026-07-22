"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "left" | "right";
  }
>(({ className, children, side = "left", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-graphite-950/50 data-[state=closed]:animate-out data-[state=open]:animate-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 z-50 w-[min(22rem,88vw)] overflow-y-auto border-border bg-sidebar p-5 text-sidebar-foreground shadow-2xl outline-none",
        side === "left" ? "left-0 border-r" : "right-0 border-l",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Close navigation"
      >
        <X className="size-4" aria-hidden="true" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

export { Sheet, SheetTrigger, SheetClose, SheetContent };
