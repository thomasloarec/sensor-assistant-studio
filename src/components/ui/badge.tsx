import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border-0 px-2.5 py-1 text-[0.8125rem] font-semibold transition-colors duration-[var(--d-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--surface-tint)] text-[var(--standex-blue)]",
        secondary: "bg-[var(--muted)] text-[var(--muted-foreground)]",
        outline:
          "bg-transparent text-[var(--foreground)] shadow-[inset_0_0_0_1px_var(--hairline-strong)]",
        destructive: "bg-[var(--destructive-soft)] text-[var(--destructive)]",
        success: "bg-[var(--success-soft)] text-[var(--success)]",
        warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
