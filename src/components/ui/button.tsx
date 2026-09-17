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
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-sans text-xs uppercase tracking-[0.14em]",
    "transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-40",
    // Controls read left to right whatever section they sit in.
    "[direction:ltr]",
  ],
  {
    variants: {
      variant: {
        // The accent, used for the action we want taken.
        primary: "bg-accent text-paper hover:bg-ink",
        // A hairline box: present, but quieter than the accent.
        outline: "border border-ink text-ink hover:bg-ink hover:text-paper",
        // Text only, for destructive or incidental actions.
        ghost: "text-muted underline underline-offset-4 hover:text-accent",
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
