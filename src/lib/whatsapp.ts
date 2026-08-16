/**
 * The WhatsApp handoff (§26).
 *
 * The brief's framing is exact and worth keeping in mind while reading this:
 * WhatsApp is "deeply integrated but not used as a substitute for collecting
 * structured information". The structured enquiry is written to the database
 * first; this message is a human-readable summary of a record that already
 * exists, carrying the reference number so the conversation and the record can
 * be joined up later.
 *
 * "The user should only need to press Send." That is the acceptance criterion
 * for this file, and it is why the message is built from the submitted
 * snapshot rather than re-derived from the basket — by the time this runs the
 * basket may already have been cleared.
 */

import { BUSINESS } from "./business";
import { formatGbp } from "./services";
import { formatMileage, formatRegistration } from "./vehicle";
import type { EnquirySnapshot } from "./enquiry";

/** wa.me has a practical limit; well past anything this builds, but checked. */
const MAX_MESSAGE_LENGTH = 4000;

/**
 * The prefilled message.
 *
 * Every optional line is genuinely omitted when absent rather than rendered as
 * "Mileage: unknown" — a message full of blanks reads as a form, and the point
 * of arriving in WhatsApp is that it reads as a person.
 */
export function buildWhatsAppMessage(snapshot: EnquirySnapshot): string {
  const lines: string[] = [];

  lines.push(`Hi ${BUSINESS.name}, I've built a service request through the website.`);
  lines.push("");

  const vehicleLine = snapshot.vehicleDescription
    ? `Vehicle: ${snapshot.vehicleDescription}`
    : "Vehicle: BMW";
  lines.push(vehicleLine);

  if (snapshot.registration) {
    lines.push(`Registration: ${formatRegistration(snapshot.registration)}`);
  }
  if (snapshot.mileage !== undefined && snapshot.mileage !== null) {
    lines.push(`Mileage: ${formatMileage(snapshot.mileage)}`);
  }

  lines.push("");
  lines.push("Requested services:");
  for (const item of snapshot.items) {
    // The pricing type travels with the line, so the first thing Drive Precise
    // reads is which of these are already firm and which need working out.
    const price =
      item.pricing === "quote" || item.priceGbp === undefined
        ? "quote required"
        : item.pricing === "from"
          ? `from ${formatGbp(item.priceGbp)}`
          : formatGbp(item.priceGbp);
    lines.push(`• ${item.name} (${price})`);
  }

  if (snapshot.indicativeTotalGbp > 0) {
    lines.push("");
    lines.push(
      `Website ${snapshot.hasFromPricing ? "estimated from" : "estimated"} total: ${formatGbp(
        snapshot.indicativeTotalGbp,
      )}`,
    );
    if (snapshot.quoteOnlyCount > 0) {
      lines.push(
        `Plus ${snapshot.quoteOnlyCount} item${snapshot.quoteOnlyCount === 1 ? "" : "s"} to be quoted.`,
      );
    }
  }

  lines.push("");
  if (snapshot.postcode) lines.push(`Postcode: ${snapshot.postcode.toUpperCase()}`);
  if (snapshot.locationLabel) lines.push(`Where: ${snapshot.locationLabel}`);
  if (snapshot.preferredLabel) lines.push(`Preferred appointment: ${snapshot.preferredLabel}`);

  if (snapshot.notes?.trim()) {
    lines.push("");
    lines.push(`Notes: ${snapshot.notes.trim()}`);
  }

  if (snapshot.reference) {
    lines.push("");
    lines.push(`Reference: ${snapshot.reference}`);
  }

  lines.push("");
  lines.push("Please confirm the final vehicle-specific price and availability.");

  const message = lines.join("\n");
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : message;
}

/**
 * A wa.me link with the message prefilled.
 *
 * `encodeURIComponent` rather than URLSearchParams because the latter encodes
 * spaces as `+`, which WhatsApp renders literally — the customer would open a
 * message full of plus signs.
 */
export function whatsappHref(text: string, phone: string = BUSINESS.whatsapp): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** A plain "start a conversation" link, for header and footer CTAs. */
export function whatsappGeneralHref(context?: string): string {
  const text = context
    ? `Hi ${BUSINESS.name}, I have a question about ${context}.`
    : `Hi ${BUSINESS.name}, I'd like to ask about work on my BMW.`;
  return whatsappHref(text);
}
