/**
 * Vehicle lookup, front end half (§21).
 *
 * The rule this file exists to keep is "Never fabricate vehicle details", and
 * the temptation it resists is specific: customers describe their car as a
 * "320d", and engine capacity plus fuel gets you *almost* there. Almost is the
 * problem. A 1995cc diesel 3 Series is a 318d, a 320d or a 325d depending on
 * tune, and showing a customer the wrong one back is worse than showing them
 * nothing — it tells someone who knows their own car that this is guesswork.
 *
 * UKVD is the primary provider precisely because it carries a real model, so
 * the honest answer is usually available rather than merely withheld. DVLA
 * remains configured as a free fallback and returns no model at all. Either
 * way the rule is the same: `describeLookup()` prints what a provider actually
 * said and stops. Where the model is missing, the customer fills it in.
 *
 * Nothing here can block an enquiry. Every failure mode resolves to "ask the
 * customer instead", because a quote request is what the business runs on and
 * a government API having a bad afternoon is not a reason to lose one.
 */

import { supabase } from "@/integrations/supabase/client";
import { normaliseRegistration, isPlausibleRegistration } from "./vehicle";

/** What the edge function returns. Never the raw DVLA payload. */
export interface LookedUpVehicle {
  registration: string;
  make: string | null;
  /**
   * Supplied by UKVD, null from DVLA, never inferred from engine capacity.
   *
   * A 1995cc diesel 3 Series is a 318d, a 320d or a 325d depending on tune.
   * Guessing which would put the wrong car in front of someone who knows
   * their own (§21).
   */
  model: string | null;
  derivative: string | null;
  engineCode: string | null;
  gearbox: string | null;
  bodyStyle: string | null;
  firstRegisteredDate: string | null;
  /** Stock image for the model, not a photo of this car. Decorative. */
  imageUrl: string | null;
  colour: string | null;
  fuelType: string | null;
  engineCapacityCc: number | null;
  yearOfManufacture: number | null;
  monthOfFirstRegistration: string | null;
  co2Emissions: number | null;
  euroStatus: string | null;
  wheelplan: string | null;
  taxStatus: string | null;
  taxDueDate: string | null;
  motStatus: string | null;
  motExpiryDate: string | null;
  markedForExport: boolean | null;
  source: string;
}

/**
 * Every way a lookup can end.
 *
 * Distinct cases rather than a boolean, because the right thing to say to the
 * customer differs in each. "We don't recognise that registration" and "our
 * lookup is having a moment" are different sentences, and telling someone
 * their real car does not exist because a government API timed out is the kind
 * of small dishonesty this codebase keeps refusing to commit.
 */
export type LookupResult =
  | { status: "found"; vehicle: LookedUpVehicle; cached: boolean }
  | { status: "not_found" }
  | { status: "invalid" }
  | { status: "not_configured" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

function intOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Coerce whatever came back into a `LookedUpVehicle`.
 *
 * The response crosses a network boundary, so it is untrusted input like any
 * other. Same reasoning as the stored quote draft: the type annotation is a
 * claim, and this is the only place it can be made true.
 */
export function parseVehicle(input: unknown): LookedUpVehicle | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;

  const registration = textOrNull(raw.registration);
  if (!registration) return null;

  return {
    registration: normaliseRegistration(registration),
    make: textOrNull(raw.make),
    model: textOrNull(raw.model),
    derivative: textOrNull(raw.derivative),
    engineCode: textOrNull(raw.engineCode),
    gearbox: textOrNull(raw.gearbox),
    bodyStyle: textOrNull(raw.bodyStyle),
    firstRegisteredDate: textOrNull(raw.firstRegisteredDate),
    imageUrl: safeImageUrl(raw.imageUrl),
    colour: textOrNull(raw.colour),
    fuelType: textOrNull(raw.fuelType),
    engineCapacityCc: intOrNull(raw.engineCapacityCc),
    yearOfManufacture: intOrNull(raw.yearOfManufacture),
    monthOfFirstRegistration: textOrNull(raw.monthOfFirstRegistration),
    co2Emissions: intOrNull(raw.co2Emissions),
    euroStatus: textOrNull(raw.euroStatus),
    wheelplan: textOrNull(raw.wheelplan),
    taxStatus: textOrNull(raw.taxStatus),
    taxDueDate: textOrNull(raw.taxDueDate),
    motStatus: textOrNull(raw.motStatus),
    motExpiryDate: textOrNull(raw.motExpiryDate),
    markedForExport: typeof raw.markedForExport === "boolean" ? raw.markedForExport : null,
    source: textOrNull(raw.source) ?? "unknown",
  };
}

/** Map an edge function response body onto a result. Never throws. */
export function parseLookupResponse(body: unknown): LookupResult {
  if (typeof body !== "object" || body === null) return { status: "unavailable" };
  const raw = body as Record<string, unknown>;

  switch (raw.status) {
    case "found": {
      const vehicle = parseVehicle(raw.vehicle);
      // A "found" with nothing usable in it is not a find.
      return vehicle
        ? { status: "found", vehicle, cached: raw.cached === true }
        : { status: "unavailable" };
    }
    case "not_found":
      return { status: "not_found" };
    case "invalid":
      return { status: "invalid" };
    case "not_configured":
      return { status: "not_configured" };
    case "rate_limited":
      return { status: "rate_limited" };
    default:
      return { status: "unavailable" };
  }
}

/**
 * Look a registration up.
 *
 * Resolves rather than rejects, always. A caller should never need a try/catch
 * around this, because there is no failure here that should interrupt what the
 * customer is doing.
 */
export async function lookupVehicle(registration: string): Promise<LookupResult> {
  const reg = normaliseRegistration(registration);
  // Don't spend a call, or a rate-limit slot, on something that cannot be a
  // plate. The customer is probably still typing.
  if (!isPlausibleRegistration(reg)) return { status: "invalid" };

  try {
    const { data, error } = await supabase.functions.invoke("vehicle-lookup", {
      body: { registration: reg },
    });
    if (error) return { status: "unavailable" };
    return parseLookupResponse(data);
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * The one-line description shown back to the customer.
 *
 * Only fields a provider actually returned, in the order a person would say
 * them. Returns null when there is genuinely nothing worth printing, so a
 * caller renders nothing rather than an empty shell.
 */
export function describeLookup(vehicle: LookedUpVehicle): string | null {
  const parts: string[] = [];

  if (vehicle.yearOfManufacture) parts.push(String(vehicle.yearOfManufacture));
  if (vehicle.make) parts.push(titleCase(vehicle.make));
  if (vehicle.model) parts.push(vehicle.model);
  // "M Sport" and the like. Only ever printed when the provider said it.
  if (vehicle.derivative && vehicle.derivative !== vehicle.model) {
    parts.push(vehicle.derivative);
  }

  const spec: string[] = [];
  if (vehicle.engineCapacityCc) spec.push(formatEngine(vehicle.engineCapacityCc));
  if (vehicle.fuelType) spec.push(titleCase(vehicle.fuelType));
  if (vehicle.colour) spec.push(titleCase(vehicle.colour));

  const head = parts.join(" ");
  const tail = spec.join(", ");

  if (!head && !tail) return null;
  if (!tail) return head;
  if (!head) return tail;
  return `${head} · ${tail}`;
}

/**
 * An image URL only if it is one, and only over https.
 *
 * The value crosses a network boundary and lands in an `img src`. Anything
 * that is not a plain https URL is dropped rather than rendered.
 */
export function safeImageUrl(value: unknown): string | null {
  const raw = textOrNull(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** 1995 becomes "2.0L", which is how people describe their own engine. */
export function formatEngine(cc: number): string {
  if (!Number.isFinite(cc) || cc <= 0) return "";
  return `${(Math.round(cc / 100) / 10).toFixed(1)}L`;
}

/** DVLA sends "BMW", "DIESEL", "BLACK". Only the shouting needs fixing. */
export function titleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Anything with a lower-case letter already came formatted; leave it be.
  if (/[a-z]/.test(trimmed)) return trimmed;
  // Short all-caps tokens are usually initialisms worth keeping: BMW, MG.
  if (trimmed.length <= 3) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word) => (word.length <= 3 ? word : word[0] + word.slice(1).toLowerCase()))
    .join(" ");
}

/** True when the register says this is a BMW. */
export function isBmw(vehicle: LookedUpVehicle): boolean {
  return (vehicle.make ?? "").trim().toUpperCase() === "BMW";
}

/**
 * Days until the MOT runs out, or null.
 *
 * Genuinely useful rather than a growth tactic: a customer booking a service
 * three weeks before their MOT expires wants to know that now, and the
 * pre-MOT check exists precisely for them. Negative means it has already
 * lapsed, which matters more.
 */
export function daysUntilMot(vehicle: LookedUpVehicle, now: Date = new Date()): number | null {
  if (!vehicle.motExpiryDate) return null;
  const expiry = new Date(`${vehicle.motExpiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiry.getTime() - midnight.getTime()) / 86_400_000);
}
