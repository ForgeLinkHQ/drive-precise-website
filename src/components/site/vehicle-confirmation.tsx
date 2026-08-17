import { useEffect, useRef, useState } from "react";
import { Check, Info, Loader2 } from "lucide-react";

import { Link } from "@tanstack/react-router";
import {
  daysUntilMot,
  describeLookup,
  isBmw,
  lookupVehicle,
  type LookedUpVehicle,
  type LookupResult,
} from "@/lib/vehicle-lookup";
import { isPlausibleRegistration, normaliseRegistration } from "@/lib/vehicle";
import { trackEvent } from "@/lib/analytics";

/**
 * "Is this your car?", answered by the register (§21).
 *
 * The value of this is not the technology, it is the two seconds where a
 * customer sees their own car named back to them and relaxes. That is worth
 * getting right, and it is worth refusing to fake: everything shown here came
 * from DVLA, and the model — the one field customers most expect — is absent
 * because DVLA does not return it and guessing it from engine size would put
 * "320d" in front of someone driving a 318d.
 *
 * Every failure is silent from the customer's point of view. If the lookup is
 * unconfigured, rate limited, slow or broken, this renders nothing at all and
 * the form behaves exactly as it did before the feature existed. Losing an
 * enquiry because a government API had a bad afternoon would be a far worse
 * outcome than not knowing the colour of someone's car.
 */

/** Long enough that it isn't firing on every keystroke of a 7-character plate. */
const DEBOUNCE_MS = 600;

export function VehicleConfirmation({
  registration,
  onFound,
}: {
  registration: string;
  onFound: (vehicle: LookedUpVehicle | null) => void;
}) {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  // The registration a request was fired for, so a stale response from a
  // previous plate cannot overwrite the current one.
  const requested = useRef<string>("");
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  const reg = normaliseRegistration(registration);

  useEffect(() => {
    if (!isPlausibleRegistration(reg)) {
      setResult(null);
      setLoading(false);
      requested.current = "";
      onFoundRef.current(null);
      return;
    }

    if (requested.current === reg) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      requested.current = reg;
      setLoading(true);

      void lookupVehicle(reg).then((outcome) => {
        if (cancelled) return;
        setLoading(false);
        setResult(outcome);
        onFoundRef.current(outcome.status === "found" ? outcome.vehicle : null);

        if (outcome.status === "found") {
          // No registration in the event: it is personal data, and the
          // analytics module refuses to carry one.
          trackEvent("vehicle_looked_up", {
            meta: { make: outcome.vehicle.make ?? "unknown", cached: outcome.cached },
          });
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reg]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Checking that registration…
      </p>
    );
  }

  if (!result) return null;

  // Everything that isn't a confirmed find renders nothing. "Not found" is
  // deliberately silent too: plates are missing from the register for ordinary
  // reasons, and telling someone their car does not exist when it is sitting
  // on their drive helps nobody. They type the details in, as before.
  if (result.status !== "found") return null;

  const { vehicle } = result;
  const described = describeLookup(vehicle);
  if (!described) return null;

  const motDays = daysUntilMot(vehicle);
  const notBmw = !isBmw(vehicle);

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4" aria-live="polite">
      <p className="flex items-start gap-2 text-sm">
        <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <span className="font-medium">{described}</span>
          <span className="block text-muted-foreground">
            From the DVLA record for this registration.
          </span>
        </span>
      </p>

      {/* The model is the one thing customers expect and the one thing the
          register does not carry. Saying so is better than a blank. */}
      {!vehicle.model && (
        <p className="mt-3 text-sm text-muted-foreground">
          DVLA doesn't publish the model, so tell us below if it's a 320d, a 118i or something else.
          It helps us get the parts right first time.
        </p>
      )}

      {notBmw && (
        <p className="mt-3 flex items-start gap-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            That's not a BMW, and BMW is our specialism. We do take on other makes, so carry on and
            we'll tell you honestly whether we're the right people for it.
          </span>
        </p>
      )}

      {/* A real reason to book, from the public record rather than from us
          inventing urgency (§35). */}
      {motDays !== null && motDays >= 0 && motDays <= 60 && (
        <p className="mt-3 text-sm">
          Its MOT runs out in {motDays} {motDays === 1 ? "day" : "days"}.{" "}
          <Link
            to="/service/$serviceId"
            params={{ serviceId: "pre-mot-check" }}
            className="underline underline-offset-4 hover:text-accent"
          >
            A pre-MOT check
          </Link>{" "}
          is worth doing before then.
        </p>
      )}
      {motDays !== null && motDays < 0 && (
        <p className="mt-3 text-sm">
          The record shows its MOT expired {Math.abs(motDays)}{" "}
          {Math.abs(motDays) === 1 ? "day" : "days"} ago. Worth sorting before anything else.
        </p>
      )}
    </div>
  );
}
