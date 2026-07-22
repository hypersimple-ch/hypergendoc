import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-transparent px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-accent",
        outline:
          "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "min-h-0 rounded-none px-0 py-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 min-h-9 rounded-md px-3 text-xs",
        lg: "h-12 px-6",
        icon: "size-11 px-0",
        "icon-sm": "size-9 min-h-9 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, type = "button", ...props },
    ref,
  ) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
