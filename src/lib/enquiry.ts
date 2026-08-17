/**
 * The enquiry record (§27) and its submission.
 *
 * This is the object the whole front end exists to produce. §67: "The
 * operating system behind it should make every enquiry structured enough that
 * Drive Precise can quote it → book it → complete it → document it → invoice
 * it." Everything TechMan will need is captured here, in a shape that a human
 * can copy across in one go (§28) until an official API exists.
 *
 * The snapshot is immutable by intent. Prices are resolved from the live
 * catalogue exactly once — at submit — and frozen into the record, so the
 * quote Drive Precise reads a week later is the quote the customer was shown,
 * not what the catalogue happens to say by then.
 */

import { supabase } from "@/integrations/supabase/client";
import { basketTotals, resolveItems, type QuoteDraft, type ServiceLocation } from "./basket";
import { currentAttribution, type ReferralSource } from "./attribution";
import { SERVICES, type Service } from "./services";
import { describeVehicle, normaliseRegistration, parseMileage } from "./vehicle";

/** The lifecycle of an enquiry (§27). */
export type EnquiryStatus =
  | "new"
  | "contacted"
  | "awaiting_information"
  | "quoted"
  | "quote_accepted"
  | "booking_pending"
  | "booked"
  | "lost"
  | "completed";

export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  awaiting_information: "Awaiting information",
  quoted: "Quoted",
  quote_accepted: "Quote accepted",
  booking_pending: "Booking pending",
  booked: "Booked",
  lost: "Lost",
  completed: "Completed",
};

/** Statuses that still need someone to do something. */
export const OPEN_STATUSES: EnquiryStatus[] = [
  "new",
  "contacted",
  "awaiting_information",
  "quoted",
  "quote_accepted",
  "booking_pending",
];

export const LOCATION_LABEL: Record<ServiceLocation, string> = {
  home: "At my home",
  workplace: "At my workplace",
  collection: "Collection may be required",
  unsure: "Not sure yet",
};

export interface EnquiryLineItem {
  kind: "service" | "package";
  id: string;
  name: string;
  pricing: "fixed" | "from" | "quote";
  priceGbp?: number;
  /** For packages, the service ids inside — so the job card can be built. */
  contains?: string[];
}

/**
 * What was submitted, frozen. Also exactly what the WhatsApp message is built
 * from, so the message and the record can never disagree.
 */
export interface EnquirySnapshot {
  reference: string | null;
  createdAt: string;

  name: string;
  phone: string;
  email: string;

  registration: string;
  mileage: number | null;
  vehicleDescription: string;
  vehicleNotes: string;

  items: EnquiryLineItem[];
  indicativeTotalGbp: number;
  hasFromPricing: boolean;
  quoteOnlyCount: number;

  postcode: string;
  location: ServiceLocation | null;
  locationLabel: string | null;
  preferredDate: string | null;
  preferredWindow: string | null;
  preferredLabel: string | null;

  notes: string;
  referralSource: ReferralSource;
  campaign: string | null;
}

export interface DraftValidation {
  ok: boolean;
  /** Field name → plain-English error. No jargon, no codes (§49). */
  errors: Record<string, string>;
}

/**
 * What the form insists on before it will submit.
 *
 * Deliberately short. §59: "Do not demand everything upfront." A registration,
 * something to work on, a name and a way to reach them is genuinely all Drive
 * Precise needs to start the conversation — everything else is helpful, not
 * required.
 */
export function validateDraft(draft: QuoteDraft): DraftValidation {
  const errors: Record<string, string> = {};

  if (draft.items.length === 0) {
    errors.items = "Choose at least one service so we know what you'd like doing.";
  }
  if (!normaliseRegistration(draft.vehicle.registration)) {
    errors.registration = "We need your registration to identify the right parts for your car.";
  }
  if (!draft.contact.name.trim()) {
    errors.name = "Please tell us your name.";
  }

  const phone = draft.contact.phone.replace(/[^0-9+]/g, "");
  if (!phone) {
    errors.phone = "Please give us a mobile number so we can confirm your quote.";
  } else if (phone.replace(/\D/g, "").length < 10) {
    errors.phone = "That number looks too short. Please check it.";
  }

  const email = draft.contact.email.trim();
  // Email is optional — a mobile number is enough to run this business on —
  // but a typo in one that was supplied is worth catching.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "That email address doesn't look right. Please check it.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

const WINDOW_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  flexible: "Flexible",
};

/**
 * A human-readable preferred appointment, e.g. "Friday 12 September, morning".
 *
 * Never rendered as a confirmation. §22 step 7 is explicit: a preference is not
 * an appointment, and nothing on this site tells a customer they have one.
 */
function preferredLabel(draft: QuoteDraft): string | null {
  const parts: string[] = [];
  if (draft.timing.preferredDate) {
    const date = new Date(`${draft.timing.preferredDate}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      parts.push(
        new Intl.DateTimeFormat("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(date),
      );
    }
  }
  if (draft.timing.window) parts.push(WINDOW_LABEL[draft.timing.window].toLowerCase());
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Freeze a draft into the record that gets stored and messaged. */
export function buildSnapshot(
  draft: QuoteDraft,
  options: { referralSource?: ReferralSource; services?: Service[] } = {},
): EnquirySnapshot {
  const services = options.services ?? SERVICES;
  const resolved = resolveItems(draft.items, services);
  const totals = basketTotals(resolved);
  const attribution = currentAttribution();

  return {
    reference: null,
    createdAt: new Date().toISOString(),

    name: draft.contact.name.trim(),
    phone: draft.contact.phone.trim(),
    email: draft.contact.email.trim(),

    registration: normaliseRegistration(draft.vehicle.registration),
    mileage: parseMileage(draft.vehicle.mileage),
    // No lookup at launch, so there is nothing to describe beyond what the
    // customer told us (§21). Never invented.
    vehicleDescription: describeVehicle({
      registration: normaliseRegistration(draft.vehicle.registration),
    }),
    vehicleNotes: draft.vehicle.notes.trim(),

    items: resolved.map((item) => ({
      kind: item.kind,
      id: item.id,
      name: item.name,
      pricing: item.pricing,
      priceGbp: item.priceGbp,
      contains: item.contains?.map((s) => s.id),
    })),
    indicativeTotalGbp: totals.indicativeTotalGbp,
    hasFromPricing: totals.hasFromPricing,
    quoteOnlyCount: totals.quoteOnlyCount,

    postcode: draft.location.postcode.trim().toUpperCase(),
    location: draft.location.kind,
    locationLabel: draft.location.kind ? LOCATION_LABEL[draft.location.kind] : null,
    preferredDate: draft.timing.preferredDate || null,
    preferredWindow: draft.timing.window,
    preferredLabel: preferredLabel(draft),

    notes: draft.notes.trim(),
    referralSource: options.referralSource ?? attribution.inferredSource,
    campaign: attribution.campaign ?? null,
  };
}

export type SubmitResult =
  | { ok: true; snapshot: EnquirySnapshot }
  | { ok: false; snapshot: EnquirySnapshot; message: string };

/**
 * Store the enquiry and take its reference number.
 *
 * On failure the snapshot still comes back, without a reference. That is
 * deliberate: the customer has done the work of building a request, and the
 * right response to a database being unreachable is to hand them a WhatsApp
 * message containing everything they told us — not an apology and an empty
 * screen. Drive Precise creates the record by hand in that case, which is the
 * same manual path §28 already accepts for TechMan.
 */
export async function submitEnquiry(snapshot: EnquirySnapshot): Promise<SubmitResult> {
  try {
    // An RPC rather than `.insert().select()`: PostgREST turns the latter into
    // INSERT ... RETURNING, which Postgres only permits with a SELECT policy on
    // the table — and granting anon SELECT on `enquiries` to hand back one
    // reference number would expose every customer's name, number and
    // registration to anyone holding the publishable key.
    const { data, error } = await supabase.rpc("create_enquiry", {
      _customer_name: snapshot.name,
      _customer_phone: snapshot.phone,
      _customer_email: snapshot.email || null,
      _registration: snapshot.registration,
      _mileage: snapshot.mileage,
      _vehicle_notes: snapshot.vehicleNotes || null,
      _items: snapshot.items as never,
      _indicative_total_gbp: snapshot.indicativeTotalGbp,
      _has_from_pricing: snapshot.hasFromPricing,
      _quote_only_count: snapshot.quoteOnlyCount,
      _postcode: snapshot.postcode || null,
      _service_location: snapshot.location,
      _preferred_date: snapshot.preferredDate,
      _preferred_window: snapshot.preferredWindow,
      _customer_notes: snapshot.notes || null,
      _referral_source: snapshot.referralSource,
      _campaign: snapshot.campaign,
    });

    if (error || !data) {
      return {
        ok: false,
        snapshot,
        message:
          "We couldn't save your request just now. Your details are below. Send them on WhatsApp and we'll pick it up from there.",
      };
    }

    return { ok: true, snapshot: { ...snapshot, reference: data } };
  } catch {
    return {
      ok: false,
      snapshot,
      message:
        "We couldn't reach our system just now. Your details are below. Send them on WhatsApp and we'll pick it up from there.",
    };
  }
}
