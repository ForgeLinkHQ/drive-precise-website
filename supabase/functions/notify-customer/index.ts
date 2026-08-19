/**
 * Edge function: tell the customer something.
 *
 * The counterpart to `notify-owner`, and separate from it for a reason that is
 * not tidiness. That one writes to a single address belonging to the business
 * and can say anything. This one writes to members of the public, which means
 * consent, plain identification, an unsubscribe where one is owed, and a much
 * stronger obligation never to send the same thing twice.
 *
 * Called by `dispatch_customer_messages()` on a sweep, never from a trigger —
 * a customer's INSERT must not be able to fail because Resend is having a bad
 * afternoon. The queue marks a row sent *before* posting here, so a crash loses
 * one message rather than sending it repeatedly. For an MOT reminder that is
 * plainly the right way round.
 *
 * Request: POST { kind, detail, to_email, to_phone }
 *
 * Service-role only. There is no end user in this loop either — the recipient
 * is not the caller.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { CUSTOMER_LINKS } from "../_shared/links.ts";
import {
  btn,
  customerWrapper,
  esc,
  eyebrow,
  facts,
  h1,
  hr,
  p,
  small,
} from "../_shared/email-template.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM =
  Deno.env.get("CUSTOMER_FROM") ?? "Drive Precise <hello@driveprecise.co.uk>";

type MessageKind =
  | "booking_confirmation"
  | "booking_reminder"
  | "quote_sent"
  | "review_invite"
  | "mot_recall"
  | "service_recall";

interface Payload {
  kind: MessageKind;
  detail: Record<string, unknown>;
  to_email?: string | null;
  to_phone?: string | null;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

/** "Wednesday 3 September, 9:00am" — the way a person would say it. */
function whenText(iso: unknown): string | undefined {
  const raw = str(iso);
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(d);
}

function dateText(iso: unknown): string | undefined {
  const raw = str(iso);
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(d);
}

/** The vehicle, described only from what a provider actually returned (§21). */
function vehicleText(d: Record<string, unknown>): string {
  const parts = [str(d.vehicle_make), str(d.vehicle_model)].filter(Boolean);
  const reg = str(d.registration);
  if (parts.length === 0) return reg ?? "your vehicle";
  return reg ? `${parts.join(" ")} (${reg})` : parts.join(" ");
}

interface Built {
  subject: string;
  html: string;
}

function build(kind: MessageKind, d: Record<string, unknown>): Built | null {
  const name = str(d.first_name) ?? str(d.customer_name)?.split(" ")[0];
  const hello = name ? `Hello ${esc(name)},` : "Hello,";

  switch (kind) {
    case "booking_confirmation": {
      const when = whenText(d.starts_at);
      return {
        subject: `Your booking is confirmed${when ? ` — ${when}` : ""}`,
        html: customerWrapper(
          eyebrow("Booking confirmed") +
            h1("You're booked in") +
            p(hello) +
            p("Everything is confirmed. Here are the details:") +
            facts([
              ["Work", str(d.service_name)],
              ["When", when],
              ["Where", str(d.postcode)],
              ["Vehicle", str(d.registration)],
            ]) +
            hr() +
            p(
              "If anything changes, reply to this email or call and we will move it. " +
                "The earlier we know, the easier it is to give the slot to somebody else.",
            ) +
            small("Drive Precise comes to you — please make sure there is safe access to the vehicle."),
        ),
      };
    }

    case "booking_reminder": {
      const when = whenText(d.starts_at);
      return {
        subject: `Reminder: we're with you ${when ?? "soon"}`,
        html: customerWrapper(
          eyebrow("Tomorrow") +
            h1("A reminder about your booking") +
            p(hello) +
            p(`Just a note that we are booked in for ${esc(str(d.service_name) ?? "your work")}.`) +
            facts([
              ["When", when],
              ["Where", str(d.postcode)],
              ["Vehicle", str(d.registration)],
            ]) +
            hr() +
            p("If that no longer works, tell us as soon as you can and we will rearrange."),
        ),
      };
    }

    case "quote_sent": {
      const token = str(d.token);
      const total = str(d.quoted_total_gbp);
      return {
        subject: `Your quote from Drive Precise${total ? ` — £${total}` : ""}`,
        html: customerWrapper(
          eyebrow("Your quote") +
            h1("Here's your quote") +
            p(hello) +
            p(`Thanks for your enquiry about ${esc(vehicleText(d))}. Here is what the work comes to:`) +
            facts([
              ["Vehicle", vehicleText(d)],
              ["Total", total ? `£${total}` : undefined],
              ["Reference", str(d.reference)],
            ]) +
            (token ? btn("View and accept your quote", CUSTOMER_LINKS.quote(token)) : "") +
            hr() +
            p(
              "This price is for the work described and holds for 14 days. " +
                "If anything is found once we are with the vehicle we will tell you before doing it — " +
                "we never carry out work you have not agreed to.",
            ),
        ),
      };
    }

    case "mot_recall": {
      const expiry = dateText(d.mot_expiry_date);
      const days = typeof d.days_remaining === "number" ? d.days_remaining : undefined;
      return {
        subject: `Your MOT runs out${expiry ? ` on ${expiry}` : " soon"}`,
        html: customerWrapper(
          eyebrow("MOT due") +
            h1(`Your MOT is due${days !== undefined ? ` in ${days} days` : ""}`) +
            p(hello) +
            p(
              `The MOT on ${esc(vehicleText(d))} expires${expiry ? ` on ${esc(expiry)}` : " shortly"}. ` +
                "Driving without a valid one invalidates most insurance, so it is worth getting in the diary.",
            ) +
            facts([
              ["Vehicle", vehicleText(d)],
              ["MOT expires", expiry],
            ]) +
            p(
              "Drive Precise does not carry out MOT tests. What we can do is get the car ready for one — " +
                "the checks that account for most failures are things we can do at your home or work.",
            ) +
            btn("Book an MOT preparation check", CUSTOMER_LINKS.checks) +
            hr() +
            small(
              "You are getting this because you asked us about this vehicle. " +
                "The date comes from the DVLA record.",
            ),
        ),
      };
    }

    case "service_recall": {
      return {
        subject: "Your BMW is about due a service",
        html: customerWrapper(
          eyebrow("Service due") +
            h1("About due a service") +
            p(hello) +
            p(
              `It has been a while since we looked at ${esc(vehicleText(d))}. ` +
                "If it is coming up to a service interval, we can come to you.",
            ) +
            btn("Build a quote", CUSTOMER_LINKS.book),
        ),
      };
    }

    case "review_invite": {
      return {
        subject: "How did we do?",
        html: customerWrapper(
          eyebrow("Thank you") +
            h1("How did we do?") +
            p(hello) +
            p(
              `Thanks for having us out for ${esc(str(d.service_name) ?? "the work")}. ` +
                "If you have a minute, a short review genuinely helps — most of our work comes from people telling somebody else.",
            ) +
            btn("Leave a review", CUSTOMER_LINKS.contact) +
            hr() +
            p("And if something was not right, reply to this and tell us instead. We would rather know."),
        ),
      };
    }
  }
  return null;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const detail = (body.detail ?? {}) as Record<string, unknown>;
  const built = build(body.kind, detail);
  if (!built) {
    return jsonResponse({ error: `Unknown message kind: ${body.kind}` }, 400);
  }

  const to = str(body.to_email);
  if (!to) {
    // Not an error. Plenty of customers give a phone number and no email, and
    // the SMS path is a separate provider. Saying so plainly beats a 400 that
    // looks like a bug in the dispatcher.
    return jsonResponse({ skipped: "no email address for this recipient" }, 200);
  }

  if (!RESEND_KEY) {
    // Deliberately a success. A site running without an email provider
    // configured should not have its queue fill up with rows that retry
    // forever — the message is already marked sent, and the log is the record.
    console.warn(`[notify-customer] RESEND_API_KEY unset; would have sent "${built.subject}" to ${to}`);
    return jsonResponse({ skipped: "email provider not configured" }, 200);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: built.subject,
      html: built.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[notify-customer] Resend rejected: ${res.status} ${text}`);
    return jsonResponse({ error: "send failed", status: res.status }, 502);
  }

  return jsonResponse({ sent: true, kind: body.kind });
});
