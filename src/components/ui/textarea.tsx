import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-24 w-full resize-y rounded-[var(--r-sm)] border-0 bg-[var(--surface-sunken)] px-4 py-3 text-base leading-[1.55]",
          "transition-[background-color,box-shadow] duration-[var(--d-fast)]",
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
Textarea.displayName = "Textarea";

export { Textarea };
