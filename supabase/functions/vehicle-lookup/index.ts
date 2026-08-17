/**
 * Vehicle lookup, server side (§21).
 *
 * This function exists for one reason above all others: the DVLA API key must
 * never reach a browser. Vite inlines anything it can see into the client
 * bundle, so a lookup called directly from the front end would publish the key
 * to every visitor and hand Drive Precise's government API quota to whoever
 * looked at the network tab. The browser talks to this; only this talks to
 * DVLA.
 *
 * What it returns is exactly what the register said, normalised. It never
 * infers. The single most tempting inference here is the model: customers
 * think in "320d", the VES response has no model field, and engine capacity
 * plus fuel very nearly gets you there. It does not get you there. A 1995cc
 * diesel 3 Series is a 318d, a 320d or a 325d depending on the state of tune,
 * and printing the wrong one back to a customer who knows their own car is
 * worse than printing nothing. §21 is the rule; this is the case it was
 * written for.
 *
 * Degradation is deliberate at every level. No API key configured: the
 * function reports that cleanly and the site behaves exactly as it did before
 * this existed. DVLA down, slow, or rate limiting: the customer types their
 * car's details in themselves, which is what they did yesterday. A lookup
 * failure must never block an enquiry, because an enquiry is the thing the
 * business actually runs on.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const DVLA_ENDPOINT =
  Deno.env.get("DVLA_VES_ENDPOINT") ??
  "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles";

/** DVLA is usually fast. Waiting longer than this is worse than asking. */
const TIMEOUT_MS = 6_000;

/** How long a cached record is trusted before it is fetched again. */
const CACHE_DAYS = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The shape the front end receives. Deliberately not the raw DVLA payload. */
interface PublicVehicle {
  registration: string;
  make: string | null;
  model: string | null;
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

type Outcome =
  | { status: "found"; vehicle: PublicVehicle; cached: boolean }
  | { status: "not_found" }
  | { status: "invalid" }
  | { status: "not_configured" }
  | { status: "rate_limited" }
  | { status: "unavailable" };

function json(outcome: Outcome, code: number): Response {
  return new Response(JSON.stringify(outcome), {
    status: code,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Storage form: upper case, no spaces or punctuation. */
function normalise(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Whether this is worth spending a DVLA call on.
 *
 * Mirrors `isPlausibleRegistration` in src/lib/vehicle.ts. Permissive on
 * purpose: rejecting a real plate is a worse failure than one wasted call, so
 * this filters out obvious nonsense and nothing more.
 */
function plausible(reg: string): boolean {
  if (reg.length < 2 || reg.length > 8) return false;
  return [
    /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/,
    /^[A-Z][0-9]{1,3}[A-Z]{3}$/,
    /^[A-Z]{3}[0-9]{1,3}[A-Z]$/,
    /^[A-Z]{1,3}[0-9]{1,4}$/,
    /^[0-9]{1,4}[A-Z]{1,3}$/,
  ].some((p) => p.test(reg));
}

/**
 * A stable, non-reversible key for the caller.
 *
 * The rate limiter needs to tell callers apart; it does not need to know who
 * they are. Hashing with a server-side salt means the table cannot be turned
 * back into a list of IP addresses, which keeps an anti-abuse mechanism from
 * quietly becoming a tracking one.
 */
async function clientHash(req: Request): Promise<string> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";
  const salt = Deno.env.get("LOOKUP_HASH_SALT") ?? "drive-precise-lookup";
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function intOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A DVLA VES response, mapped. Nothing added that DVLA did not say. */
function fromVes(reg: string, body: Record<string, unknown>): PublicVehicle {
  return {
    registration: reg,
    make: textOrNull(body.make),
    // VES has no model field. Left null rather than guessed (§21).
    model: null,
    colour: textOrNull(body.colour),
    fuelType: textOrNull(body.fuelType),
    engineCapacityCc: intOrNull(body.engineCapacity),
    yearOfManufacture: intOrNull(body.yearOfManufacture),
    monthOfFirstRegistration: textOrNull(body.monthOfFirstRegistration),
    co2Emissions: intOrNull(body.co2Emissions),
    euroStatus: textOrNull(body.euroStatus),
    wheelplan: textOrNull(body.wheelplan),
    taxStatus: textOrNull(body.taxStatus),
    taxDueDate: textOrNull(body.taxDueDate),
    motStatus: textOrNull(body.motStatus),
    motExpiryDate: textOrNull(body.motExpiryDate),
    markedForExport: typeof body.markedForExport === "boolean" ? body.markedForExport : null,
    source: "dvla-ves",
  };
}

/** A cached row, mapped back to the same public shape. */
function fromCache(row: Record<string, unknown>): PublicVehicle {
  return {
    registration: String(row.registration),
    make: (row.make as string) ?? null,
    model: (row.model as string) ?? null,
    colour: (row.colour as string) ?? null,
    fuelType: (row.fuel_type as string) ?? null,
    engineCapacityCc: intOrNull(row.engine_capacity_cc),
    yearOfManufacture: intOrNull(row.year_of_manufacture),
    monthOfFirstRegistration: (row.month_of_first_reg as string) ?? null,
    co2Emissions: intOrNull(row.co2_emissions),
    euroStatus: (row.euro_status as string) ?? null,
    wheelplan: (row.wheelplan as string) ?? null,
    taxStatus: (row.tax_status as string) ?? null,
    taxDueDate: (row.tax_due_date as string) ?? null,
    motStatus: (row.mot_status as string) ?? null,
    motExpiryDate: (row.mot_expiry_date as string) ?? null,
    markedForExport: typeof row.marked_for_export === "boolean" ? row.marked_for_export : null,
    source: String(row.source ?? "dvla-ves"),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "invalid" }, 405);

  let registration = "";
  try {
    const body = await req.json();
    registration = normalise(String(body?.registration ?? ""));
  } catch {
    return json({ status: "invalid" }, 400);
  }

  if (!plausible(registration)) return json({ status: "invalid" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin =
    supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      : null;

  // Rate limit before anything expensive. A failure to check is not a reason
  // to skip the check, so an unreachable database closes the endpoint rather
  // than opening it.
  if (admin) {
    const { data: allowed, error } = await admin.rpc("check_vehicle_lookup_rate", {
      _client_hash: await clientHash(req),
    });
    if (error) return json({ status: "unavailable" }, 503);
    if (allowed === false) return json({ status: "rate_limited" }, 429);
  }

  // Cache first. A plate's make and year do not change, and DVLA's quota is
  // worth protecting.
  if (admin) {
    const { data } = await admin
      .from("vehicle_lookups")
      .select("*")
      .eq("registration", registration)
      .gt("fetched_at", new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString())
      .maybeSingle();

    if (data) return json({ status: "found", vehicle: fromCache(data), cached: true }, 200);
  }

  const apiKey = Deno.env.get("DVLA_API_KEY");
  if (!apiKey) {
    // Not an error. The site worked without a lookup before this existed and
    // still does; the front end treats this as "ask the customer instead".
    return json({ status: "not_configured" }, 200);
  }

  let vehicle: PublicVehicle;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(DVLA_ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ registrationNumber: registration }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    // 404 is a real answer: the register has no such vehicle. Everything else
    // in the failure range is our problem, not the customer's, and is reported
    // as "unavailable" so the UI asks them to type it instead of telling them
    // their car does not exist.
    if (response.status === 404) return json({ status: "not_found" }, 200);
    if (response.status === 400) return json({ status: "invalid" }, 400);
    if (response.status === 429) return json({ status: "rate_limited" }, 429);
    if (!response.ok) return json({ status: "unavailable" }, 503);

    vehicle = fromVes(registration, await response.json());
  } catch {
    // Timeout, DNS, TLS, malformed JSON. All the same to the customer.
    return json({ status: "unavailable" }, 503);
  }

  // Cache write is best effort. Failing to remember an answer is not a reason
  // to withhold it.
  if (admin) {
    await admin
      .from("vehicle_lookups")
      .upsert(
        {
          registration: vehicle.registration,
          make: vehicle.make,
          model: vehicle.model,
          colour: vehicle.colour,
          fuel_type: vehicle.fuelType,
          engine_capacity_cc: vehicle.engineCapacityCc,
          year_of_manufacture: vehicle.yearOfManufacture,
          month_of_first_reg: vehicle.monthOfFirstRegistration,
          co2_emissions: vehicle.co2Emissions,
          euro_status: vehicle.euroStatus,
          wheelplan: vehicle.wheelplan,
          tax_status: vehicle.taxStatus,
          tax_due_date: vehicle.taxDueDate,
          mot_status: vehicle.motStatus,
          mot_expiry_date: vehicle.motExpiryDate,
          marked_for_export: vehicle.markedForExport,
          source: vehicle.source,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "registration" },
      )
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return json({ status: "found", vehicle, cached: false }, 200);
});
