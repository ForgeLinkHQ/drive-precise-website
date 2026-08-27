/**
 * Getting an enquiry into TechMan (§28).
 *
 * TechMan is the system of record: the customer, the vehicle, the estimate, the
 * invoice and the payment all live there. This website is where the request is
 * built. The join between them is this file.
 *
 * ── Why this is an interface and not an HTTP client ──
 *
 * TechMan publishes no API. Its documented website integration is one
 * direction only — a widget that writes a booking *into* TechMan's diary — and
 * its real integrations (BookMyGarage, Autodata, Sage, the parts factors) are
 * commercial partner arrangements rather than an open developer surface. There
 * is, today, no endpoint to POST a customer and an estimate to.
 *
 * The instinct is to write one anyway against a guessed shape. This repository
 * has said no to that since the schema was written, in the comment above
 * `techman_reference`: "there is no supported API to reference and inventing an
 * integration would be worse than a copy-paste that works."
 *
 * So: one interface, two providers. `manual` is live and does the job today.
 * `api` is the same interface and is switched on by configuration the day
 * TechMan confirms credentials — at which point nothing that *calls* this file
 * changes. That is the entire reason for the indirection, and it is worth the
 * one extra layer.
 *
 * ── What `manual` actually improves ──
 *
 * A person retyping an enquiry is not going to stop being a person retyping an
 * enquiry. What can change is how long it takes and how much of it they have to
 * think about. The block below is ordered the way TechMan's own screens ask for
 * it — customer, then vehicle, then the job lines — so it is a sequence of
 * pastes rather than a document to re-read and pick apart. Every field TechMan
 * will ask for is present or deliberately omitted; none are rendered as
 * "Mileage: unknown", because a form full of blanks is slower to read than a
 * short one.
 */

import type { EnquiryRow } from "@/integrations/supabase/types";
import type { EnquiryLineItem } from "./enquiry";
import { formatGbp } from "./services";
import { formatMileage, formatRegistration } from "./vehicle";

/** Which provider is in use. `api` is not reachable yet — see the note above. */
export type HandoffMode = "manual" | "api";

export function handoffMode(): HandoffMode {
  const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const raw = (
    viteEnv?.VITE_TECHMAN_HANDOFF_MODE ??
    (typeof process !== "undefined" ? process.env?.VITE_TECHMAN_HANDOFF_MODE : undefined)
  )
    ?.trim()
    .toLowerCase();
  return raw === "api" ? "api" : "manual";
}

/**
 * An enquiry in the shape TechMan asks for it, section by section.
 *
 * Structured rather than one string so the same data can be a clipboard block,
 * an email section and — eventually — a request body, without three
 * near-identical formatters drifting apart.
 */
export interface HandoffPayload {
  reference: string;
  customer: { name: string; phone: string; email: string | null };
  vehicle: {
    registration: string;
    make: string | null;
    model: string | null;
    year: number | null;
    fuel: string | null;
    engine: string | null;
    mileage: number | null;
    notes: string | null;
  };
  job: {
    lines: EnquiryLineItem[];
    indicativeTotalGbp: number;
    /** True when at least one line cannot be priced without seeing the car. */
    needsPricing: boolean;
    postcode: string | null;
    preferredDate: string | null;
    preferredWindow: string | null;
    customerNotes: string | null;
  };
}

/** NUMERIC arrives from PostgREST as a string. Same coercion as elsewhere. */
function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function lineItems(items: unknown): EnquiryLineItem[] {
  return Array.isArray(items) ? (items as EnquiryLineItem[]) : [];
}

export function buildHandoffPayload(enquiry: EnquiryRow): HandoffPayload {
  const lines = lineItems(enquiry.items);
  return {
    reference: enquiry.reference,
    customer: {
      name: enquiry.customer_name,
      phone: enquiry.customer_phone,
      email: enquiry.customer_email,
    },
    vehicle: {
      registration: enquiry.registration,
      make: enquiry.vehicle_make,
      model: enquiry.vehicle_model,
      year: enquiry.vehicle_year,
      fuel: enquiry.vehicle_fuel,
      engine: enquiry.vehicle_engine,
      mileage: enquiry.mileage,
      notes: enquiry.vehicle_notes,
    },
    job: {
      lines,
      indicativeTotalGbp: num(enquiry.indicative_total_gbp),
      // `quote_only_count` is the count frozen at submit; the lines are checked
      // too so a basket edited later still reports honestly.
      needsPricing: enquiry.quote_only_count > 0 || lines.some((l) => l.pricing !== "fixed"),
      postcode: enquiry.postcode,
      preferredDate: enquiry.preferred_date,
      preferredWindow: enquiry.preferred_window,
      customerNotes: enquiry.customer_notes,
    },
  };
}

const WINDOW_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  flexible: "Flexible",
};

/**
 * One job line, with its pricing type attached.
 *
 * The type is what tells the person pricing this which lines are already
 * settled and which are the actual work — so it travels with the line rather
 * than being summarised at the bottom where it would have to be cross-checked.
 */
function jobLine(item: EnquiryLineItem): string {
  const price =
    item.pricing === "quote" || item.priceGbp === undefined
      ? "PRICE ON INSPECTION"
      : item.pricing === "from"
        ? `from ${formatGbp(item.priceGbp)}`
        : formatGbp(item.priceGbp);
  const kind = item.kind === "package" ? " [package]" : "";
  return `- ${item.name}${kind} — ${price}`;
}

/**
 * The block a person pastes into TechMan, in TechMan's own field order.
 *
 * Section headings are shouted because this is read at speed while tabbing
 * between two windows, not studied.
 */
export function buildHandoffText(payload: HandoffPayload): string {
  const { customer, vehicle, job } = payload;

  const preferred = [
    job.preferredDate
      ? new Intl.DateTimeFormat("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date(`${job.preferredDate}T00:00:00`))
      : null,
    job.preferredWindow ? WINDOW_LABEL[job.preferredWindow]?.toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(", ");

  const vehicleDescription =
    [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || null;

  const lines: (string | null)[] = [
    `WEBSITE ENQUIRY ${payload.reference}`,
    "",
    "CUSTOMER",
    `Name: ${customer.name}`,
    `Mobile: ${customer.phone}`,
    customer.email ? `Email: ${customer.email}` : null,
    "",
    "VEHICLE",
    `Registration: ${formatRegistration(vehicle.registration)}`,
    vehicleDescription ? `Vehicle: ${vehicleDescription}` : null,
    vehicle.engine ? `Engine: ${vehicle.engine}` : null,
    vehicle.fuel ? `Fuel: ${vehicle.fuel}` : null,
    vehicle.mileage ? `Mileage: ${formatMileage(vehicle.mileage)}` : null,
    vehicle.notes ? `Vehicle notes: ${vehicle.notes}` : null,
    "",
    "WORK REQUESTED",
    ...job.lines.map(jobLine),
    "",
    // Named "indicative" rather than "total" on purpose. §23: the basket total
    // is never the bare word, and it must not become one on the way to TechMan
    // either — this is the number the website showed, not the number quoted.
    `Indicative from the website: ${formatGbp(job.indicativeTotalGbp)}`,
    job.needsPricing
      ? "NOTE: contains work that needs pricing against the vehicle before the estimate goes out."
      : "All lines fixed-price. Estimate can go out as-is.",
    "",
    "JOB DETAILS",
    job.postcode ? `Postcode: ${job.postcode}` : "Postcode: NOT GIVEN",
    preferred ? `Customer prefers: ${preferred}` : null,
    job.customerNotes ? `Customer notes: ${job.customerNotes}` : null,
  ];

  return lines.filter((line) => line !== null).join("\n");
}

/** Convenience: straight from a database row to the pasteable block. */
export function handoffTextFor(enquiry: EnquiryRow): string {
  return buildHandoffText(buildHandoffPayload(enquiry));
}

export type HandoffResult =
  | { ok: true; mode: HandoffMode; reference?: string }
  | { ok: false; mode: HandoffMode; message: string };

/**
 * Push an enquiry into TechMan.
 *
 * Under `manual` this deliberately does not pretend to have done anything: it
 * reports that a person has to complete the step, and the console shows them
 * the block to do it with. A function that returned `ok: true` here would make
 * the enquiry list claim jobs were in TechMan that nobody had entered.
 *
 * Under `api` this is where the edge function call goes. It must be an edge
 * function and not a fetch from here: TechMan credentials would be inlined into
 * the client bundle by Vite the moment they were named in a `VITE_` variable,
 * which is the same trap `.env.example` already warns about for the vehicle
 * lookup keys.
 */
export async function pushToTechMan(enquiry: EnquiryRow): Promise<HandoffResult> {
  const mode = handoffMode();

  if (mode === "api") {
    return {
      ok: false,
      mode,
      message:
        "The TechMan API provider is selected but not implemented — no supported API " +
        "has been confirmed yet. Unset VITE_TECHMAN_HANDOFF_MODE to use the copy block.",
    };
  }

  return {
    ok: false,
    mode,
    message: "Copy the block into TechMan, then save the job number here.",
  };
}
