import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[var(--r-sm)] border-0 bg-[var(--surface-sunken)] px-4 py-3 text-base",
          "transition-[background-color,box-shadow] duration-[var(--d-fast)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-[var(--muted-foreground)]",
          "focus-visible:outline-none focus-visible:bg-[var(--surface)] focus-visible:shadow-[0_0_0_2px_var(--ring),var(--e-1)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
