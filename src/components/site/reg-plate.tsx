import { useId, type ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { formatRegistration } from "@/lib/vehicle";

/**
 * A UK number plate.
 *
 * The signature device of the site. Every dealer site in the country opens by
 * asking for a registration, and the plate is the one object in this
 * customer's world that is instantly recognisable — so we draw it properly
 * rather than putting "Registration" above a grey box.
 *
 * Drawn in CSS rather than fetched as an image: it stays crisp at any size, it
 * costs no request, and it cannot fail to load and leave a blank rectangle
 * where the most important control on the page should be.
 *
 * Two forms, sharing one visual language:
 *   `RegPlateInput`   — the control. Used in the hero and the builder.
 *   `RegPlate`        — read-only display. Used in the basket and admin.
 */

function CountryBand() {
  return (
    <div className="plate-band" aria-hidden="true">
      <span className="plate-mark">UK</span>
    </div>
  );
}

export function RegPlateInput({
  value,
  onChange,
  label = "Enter your registration",
  hint,
  error,
  size = "md",
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  error?: string;
  size?: "md" | "lg";
  className?: string;
} & Omit<ComponentProps<"input">, "value" | "onChange" | "size">) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>

      <div
        className={cn(
          "plate w-full max-w-sm",
          size === "md" && "h-14 text-xl sm:text-2xl",
          size === "lg" && "h-14 text-2xl sm:h-16 sm:text-3xl md:h-[4.5rem] md:text-4xl",
        )}
      >
        <CountryBand />
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          // A plate is alphanumeric and always upper case. Without these the
          // phone keyboard opens in sentence case with autocorrect trying to
          // make English words out of "AB12CDE".
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          maxLength={9}
          placeholder="AB12 CDE"
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(
            "min-w-0 flex-1 bg-transparent px-3 text-center font-[inherit] tracking-[inherit] uppercase",
            "text-[#16161a] placeholder:text-[#16161a]/35",
            // The plate supplies its own high-contrast frame; a second focus
            // ring inside it just looks broken. The ring goes on the plate.
            "outline-none focus:outline-none",
          )}
          {...props}
        />
      </div>

      {hint && !error && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Read-only plate, for showing a registration back to its owner. */
export function RegPlate({
  registration,
  size = "sm",
  className,
}: {
  registration: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  if (!registration) return null;

  return (
    <span
      className={cn(
        "plate align-middle",
        size === "xs" && "h-6 text-[0.7rem]",
        size === "sm" && "h-8 text-sm",
        size === "md" && "h-11 text-xl",
        className,
      )}
    >
      <CountryBand />
      <span className="flex items-center px-2.5">{formatRegistration(registration)}</span>
    </span>
  );
}
