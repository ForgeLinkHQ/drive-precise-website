import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Form primitives, built around the accessibility requirements in §49 rather
 * than around a design system.
 *
 * Every field here wires its own label, hint and error together with real ids:
 * `htmlFor`, `aria-describedby`, `aria-invalid`. That is what makes a screen
 * reader announce "Registration, invalid entry, we need your registration to
 * identify the right parts" instead of just "edit text". The error is also
 * `role="alert"`, so it is announced when it appears rather than only when the
 * field is next focused.
 *
 * Errors are plain English and never red-only — they carry an icon-free text
 * prefix and sit adjacent to the field, so the message survives both colour
 * blindness and a monochrome print.
 */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Receives the ids it must wire up. */
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    required: boolean | undefined;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-muted-foreground font-normal"> (required)</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const controlClass =
  "w-full min-h-12 rounded-md border border-input bg-background px-4 py-3 text-base placeholder:text-muted-foreground/70 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive";

export function Input({ className, ...props }: ComponentProps<"input">) {
  // text-base rather than text-sm is deliberate: iOS Safari zooms the viewport
  // when a focused input's font is under 16px, which on a form this long is
  // disorienting enough that people abandon it.
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClass, "min-h-28 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClass, "pr-10", className)} {...props} />;
}
