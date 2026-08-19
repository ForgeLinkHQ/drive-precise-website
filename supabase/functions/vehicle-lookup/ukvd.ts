/**
 * UK Vehicle Data, isolated.
 *
 * Everything that knows what UKVD's responses look like lives in this file and
 * nowhere else. That matters more than usual here: **this mapping has never
 * been run against a live response.** DVLA's shape came from published
 * documentation; UKVD's came from their product list, so the field names below
 * are informed but unconfirmed.
 *
 * Structuring it this way means confirming them is a small edit to one file
 * rather than an archaeology exercise. Every field is read through `pick()`,
 * which takes a list of candidate names and returns the first that exists, so
 * a near-miss on a name degrades to a null field rather than a broken lookup.
 *
 * What must not change when the names are corrected:
 *
 *   - The model is used only when the provider actually supplies one. UKVD
 *     does return a model, which is why it was chosen over DVLA, but it is
 *     never derived from engine capacity if it is missing (§21).
 *   - Every product is gated. Drive Precise pays per package, so an
 *     unsubscribed one must degrade silently rather than erroring or, worse,
 *     being billed for.
 */

/** UKVD's data packages, as named in their API. */
export type UkvdPackage =
  | "VehicleData"
  | "MotHistory"
  | "VehicleImageData"
  | "TyreData"
  | "BatteryData"
  | "SpecAndOptionsData"
  | "ValuationData"
  | "VdiCheckFull";

const BASE = Deno.env.get("UKVD_BASE_URL") ??
  "https://uk1.ukvehicledata.co.uk/api/datapackage";

/**
 * Which packages this account actually pays for.
 *
 * Comma-separated in `UKVD_PACKAGES`. Defaults to the two the site needs to
 * function, because calling a package that is not on the plan is at best an
 * error and at worst an invoice.
 */
export function enabledPackages(): Set<UkvdPackage> {
  const raw = Deno.env.get("UKVD_PACKAGES")?.trim();
  const names = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["VehicleData"];
  return new Set(names as UkvdPackage[]);
}

export function isEnabled(pkg: UkvdPackage): boolean {
  return enabledPackages().has(pkg);
}

/** First present value among several candidate keys. */
function pick(source: Record<string, unknown> | undefined, ...keys: string[]): unknown {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function intOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** A YYYY-MM-DD date, or null. UKVD mixes ISO timestamps and plain dates. */
export function dateOrNull(value: unknown): string | null {
  const raw = textOrNull(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export interface UkvdResult {
  ok: boolean;
  /** Present when ok. UKVD nests everything under Response.DataItems. */
  items?: Record<string, unknown>;
  /** True when UKVD says the vehicle is not on the register. */
  notFound?: boolean;
}

/**
 * Call one data package.
 *
 * Returns a discriminated result rather than throwing, so the caller can tell
 * "no such vehicle" apart from "the service is having a bad afternoon". Those
 * need different things said to the customer.
 */
export async function fetchPackage(
  pkg: UkvdPackage,
  registration: string,
  apiKey: string,
  timeoutMs = 6_000,
): Promise<UkvdResult> {
  const url = new URL(`${BASE}/${pkg}`);
  url.searchParams.set("v", "2");
  url.searchParams.set("api_nullitems", "1");
  url.searchParams.set("auth_apikey", apiKey);
  url.searchParams.set("key_VRM", registration);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false };

    const body = (await response.json()) as Record<string, unknown>;
    const envelope = (body.Response ?? body) as Record<string, unknown>;
    const status = textOrNull(envelope.StatusCode) ?? "";

    // UKVD reports a missing vehicle in the body with a 200, so the status
    // string is the only thing that distinguishes it from a real failure.
    if (/notfound|no.?data|invalid.?vrm/i.test(status)) {
      return { ok: false, notFound: true };
    }
    if (!/success/i.test(status)) return { ok: false };

    return { ok: true, items: (envelope.DataItems ?? {}) as Record<string, unknown> };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** The subset of a vehicle this site actually uses. */
export interface MappedVehicle {
  make: string | null;
  model: string | null;
  derivative: string | null;
  colour: string | null;
  fuelType: string | null;
  engineCapacityCc: number | null;
  engineCode: string | null;
  gearbox: string | null;
  yearOfManufacture: number | null;
  firstRegisteredDate: string | null;
  co2Emissions: number | null;
  euroStatus: string | null;
  wheelplan: string | null;
  bodyStyle: string | null;
  taxStatus: string | null;
  taxDueDate: string | null;
  motStatus: string | null;
  motExpiryDate: string | null;
  markedForExport: boolean | null;
}

/**
 * A VehicleData response, mapped.
 *
 * UKVD groups fields under objects like `VehicleRegistration`,
 * `SmmtDetails` and `TechnicalDetails`, and the exact grouping varies by
 * package version. Rather than assume one shape, each field is looked for in
 * every place it plausibly sits. A field that genuinely is not there ends up
 * null, which every consumer already handles.
 */
export function mapVehicleData(items: Record<string, unknown>): MappedVehicle {
  const reg = (items.VehicleRegistration ?? {}) as Record<string, unknown>;
  const smmt = (items.SmmtDetails ?? {}) as Record<string, unknown>;
  const tech = (items.TechnicalDetails ?? {}) as Record<string, unknown>;
  const dims = ((tech.Dimensions ?? {}) as Record<string, unknown>) ?? {};
  const general = ((tech.General ?? {}) as Record<string, unknown>) ?? {};
  const engine = ((general.Engine ?? {}) as Record<string, unknown>) ?? {};

  return {
    make: textOrNull(pick(reg, "Make", "MakeDescription") ?? pick(smmt, "Marque")),
    // UKVD carries a model, which is the reason it was chosen over DVLA. It is
    // still only ever used when actually present — never inferred (§21).
    model: textOrNull(pick(reg, "Model") ?? pick(smmt, "Range", "ModelVariant")),
    derivative: textOrNull(pick(smmt, "ModelVariant", "Series") ?? pick(reg, "Trim")),
    colour: textOrNull(pick(reg, "Colour")),
    fuelType: textOrNull(pick(reg, "FuelType") ?? pick(smmt, "FuelType")),
    engineCapacityCc: intOrNull(
      pick(reg, "EngineCapacity") ?? pick(tech, "EngineCapacity") ??
        pick(engine, "EngineCapacity"),
    ),
    engineCode: textOrNull(
      pick(reg, "EngineNumber", "EngineCode") ?? pick(engine, "EngineCode"),
    ),
    gearbox: textOrNull(
      pick(reg, "TransmissionType", "Transmission") ?? pick(smmt, "Transmission"),
    ),
    yearOfManufacture: intOrNull(pick(reg, "YearOfManufacture")),
    firstRegisteredDate: dateOrNull(
      pick(reg, "DateFirstRegistered", "DateFirstRegisteredUk"),
    ),
    co2Emissions: intOrNull(pick(reg, "Co2Emissions") ?? pick(tech, "Co2Emissions")),
    euroStatus: textOrNull(pick(reg, "EuroStatus")),
    wheelplan: textOrNull(pick(reg, "Wheelplan", "WheelPlan")),
    bodyStyle: textOrNull(pick(smmt, "BodyStyle") ?? pick(dims, "BodyStyle")),
    taxStatus: textOrNull(pick(reg, "VehicleTaxStatus", "TaxStatus")),
    taxDueDate: dateOrNull(pick(reg, "VehicleTaxDueDate", "TaxDueDate")),
    motStatus: textOrNull(pick(reg, "MotStatus", "VehicleMotStatus")),
    motExpiryDate: dateOrNull(pick(reg, "MotExpiryDate", "VehicleMotExpiryDate")),
    markedForExport: typeof pick(reg, "Exported", "MarkedForExport") === "boolean"
      ? (pick(reg, "Exported", "MarkedForExport") as boolean)
      : null,
  };
}

/** A stock image URL for the vehicle, when the package is on the plan. */
export function mapImage(items: Record<string, unknown>): string | null {
  const image = (items.VehicleImages ?? items.VehicleImageDetails ?? {}) as Record<
    string,
    unknown
  >;
  const list = image.ImageDetailsList;
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0] as Record<string, unknown>;
    return textOrNull(pick(first, "ImageUrl", "Url"));
  }
  return textOrNull(pick(image, "ImageUrl", "Url"));
}
