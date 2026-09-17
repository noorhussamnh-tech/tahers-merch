/**
 * The button.
 *
 * One component, three weights, and nothing else. A shop with two products
 * and six actions does not need a design-system button with nine variants --
 * it needs the primary action to look like the primary action everywhere it
 * appears.
 *
 * Buttons carry English labels in the functional sans, letterspaced and
 * uppercase, and stay left-to-right even inside an RTL section, which the
 * brief requires.
 */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm",
    // Mono, letterspaced hard: the design's signature, and what keeps a button
    // reading as a control rather than as prose.
    "font-mono text-[11px] uppercase tracking-[0.2em]",
    "transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-40",
    // Controls read left to right whatever section they sit in.
    "[direction:ltr]",
  ],
  {
    variants: {
      variant: {
        // Ink by default, the way the source design has its primary button.
        primary: "bg-foreground text-background hover:bg-signal",
        // A hairline box: present, but quieter.
        outline:
          "border border-border hover:border-foreground hover:bg-foreground hover:text-background",
        // Text only, for incidental actions.
        ghost: "text-muted underline underline-offset-4 hover:text-signal",
        // The one loud button, for the action we most want taken.
        signal: "bg-signal text-signal-foreground hover:bg-foreground",
      },
      size: {
        sm: "h-9 px-4",
        md: "h-11 px-7",
        lg: "h-14 px-10 text-[0.8125rem]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  /** Renders the child element instead of a <button>, for links that act as buttons. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(button({ variant, size }), className)} {...props} />;
}

export { button as buttonVariants };
