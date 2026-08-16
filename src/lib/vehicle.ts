/**
 * Vehicle registration handling (§21).
 *
 * The rule from the brief, in full: "Never fabricate vehicle details."
 *
 * There is no registration lookup at launch, so this module does exactly two
 * things — it tidies up what the customer typed, and it says whether that looks
 * like a UK plate at all. It never infers a make, a model, an engine or a year.
 * A `VehicleDetails` record has room for those fields so a lookup provider can
 * populate them later, and every one of them is optional precisely so that an
 * unpopulated vehicle is a normal state rather than a broken one.
 *
 * The validator is deliberately permissive. Getting a plate wrong by one
 * character is common and the consequence of a false negative — a customer
 * being told their real registration is invalid — is worse than the
 * consequence of a false positive, which is a human reading it on WhatsApp and
 * asking.
 */

export interface VehicleDetails {
  /** Normalised, no spaces, upper case. The one field always present. */
  registration: string;
  mileage?: number;
  /** Everything below is populated by a lookup provider, never by us (§21). */
  make?: string;
  model?: string;
  variant?: string;
  fuel?: string;
  year?: number;
  engine?: string;
  /** How the details above were obtained. "manual" means a human confirmed them. */
  detailsSource?: "lookup" | "manual";
}

/** Storage form: upper case, no spaces or punctuation. */
export function normaliseRegistration(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Display form.
 *
 * Only the current style (two letters, two digits, three letters) gets its
 * conventional space inserted. Older formats have enough variation that
 * guessing where the space goes risks displaying a plate back to its owner in
 * a form they don't recognise, so those are shown exactly as normalised.
 */
export function formatRegistration(input: string): string {
  const reg = normaliseRegistration(input);
  if (/^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(reg)) {
    return `${reg.slice(0, 4)} ${reg.slice(4)}`;
  }
  return reg;
}

/**
 * Whether this looks like a UK registration.
 *
 * Covers the current style, the prefix and suffix styles still on the road, and
 * dateless plates. Returns false for empty input so a form can use it directly.
 */
export function isPlausibleRegistration(input: string): boolean {
  const reg = normaliseRegistration(input);
  if (reg.length < 2 || reg.length > 8) return false;

  const patterns = [
    /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/, // Current: AB12 CDE
    /^[A-Z][0-9]{1,3}[A-Z]{3}$/, // Prefix: A123 BCD
    /^[A-Z]{3}[0-9]{1,3}[A-Z]$/, // Suffix: ABC 123D
    /^[A-Z]{1,3}[0-9]{1,4}$/, // Dateless: ABC 1234
    /^[0-9]{1,4}[A-Z]{1,3}$/, // Dateless reversed: 1234 ABC
  ];
  return patterns.some((p) => p.test(reg));
}

/**
 * Mileage from free text.
 *
 * People type "52,400", "52400", "52k" and "about 52,000". The first three are
 * unambiguous; "about" is stripped along with everything else non-numeric.
 * Returns null when there is no number, or when the number is implausible —
 * a seven-digit mileage is a typo, and storing it would poison the service
 * interval logic a later version will want to build on.
 */
export function parseMileage(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const thousands = trimmed.match(/^(\d+(?:\.\d+)?)\s*k$/);
  const value = thousands
    ? Math.round(Number(thousands[1]) * 1000)
    : Number(trimmed.replace(/[^0-9]/g, ""));

  if (!Number.isFinite(value) || value <= 0) return null;
  if (value > 999_999) return null;
  return value;
}

export function formatMileage(miles: number): string {
  return new Intl.NumberFormat("en-GB").format(miles);
}

/**
 * A one-line description of the vehicle for the WhatsApp message and the
 * enquiry record.
 *
 * Falls back to "BMW (model to confirm)" rather than asserting a model we do
 * not have — the customer told us it was a BMW by coming here, but nothing
 * more than that is known until someone looks.
 */
export function describeVehicle(vehicle: VehicleDetails): string {
  const parts = [vehicle.make, vehicle.model, vehicle.variant].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return "Model to confirm";
}
