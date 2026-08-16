import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Sizes are floors, not fixed heights: `min-h` rather than `h`, so a label that
 * wraps on a narrow phone grows the button instead of overflowing it. The
 * smallest variant is still 44px tall, which is the touch-target minimum §49
 * asks for — there is deliberately no size below it.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
        outline: "border border-input bg-background hover:bg-secondary",
        ghost: "hover:bg-secondary",
        link: "text-accent underline-offset-4 hover:underline",
        whatsapp: "bg-[#25D366] text-[#0b3d21] hover:bg-[#20bd5a] font-semibold",
      },
      size: {
        sm: "min-h-11 px-4 py-2",
        md: "min-h-12 px-6 py-3",
        lg: "min-h-14 px-8 py-4 text-base",
        icon: "min-h-11 min-w-11",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}
