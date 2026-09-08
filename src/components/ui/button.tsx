import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] font-semibold cursor-pointer select-none transition-[background-color,box-shadow,transform,color] duration-[var(--d-fast)] ease-[var(--ease-out)] active:scale-[0.975] active:duration-[var(--d-instant)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-[var(--primary-foreground)] [background-image:linear-gradient(oklch(1_0_0_/_0.12),transparent_55%)] shadow-[var(--e-2)] hover:bg-[var(--primary-hover)] hover:shadow-[var(--e-3)] hover:-translate-y-px active:bg-[var(--primary-active)]",
        destructive:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)] shadow-[var(--e-2)] hover:shadow-[var(--e-3)] hover:-translate-y-px",
        outline:
          "bg-transparent text-[var(--foreground)] shadow-[inset_0_0_0_1px_var(--hairline-strong)] hover:bg-[var(--surface-tint)] hover:shadow-[inset_0_0_0_1px_var(--standex-blue-25)]",
        secondary:
          "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--accent)]",
        ghost:
          "rounded-[var(--r-sm)] bg-transparent hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
        link: "text-[var(--primary)] underline-offset-4 hover:underline transition-colors",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-10 px-4 text-[0.9375rem]",
        lg: "h-[3.25rem] px-7 text-[1.0625rem] rounded-[var(--r-pill)]",
        pill: "h-12 px-6 rounded-[var(--r-pill)]",
        icon: "h-11 w-11 rounded-[var(--r-sm)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
