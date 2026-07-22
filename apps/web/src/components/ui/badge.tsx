import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-muted-foreground",
        success: "border-success/20 bg-success-soft text-success",
        warning: "border-warning/25 bg-warning-soft text-warning",
        error: "border-destructive/20 bg-destructive-soft text-destructive",
        accent: "border-primary/15 bg-accent text-accent-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
