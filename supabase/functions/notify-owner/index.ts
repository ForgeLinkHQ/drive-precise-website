/**
 * Edge function: tell the owner something happened.
 *
 * This is the doorbell. Before it existed an enquiry was written to a table and
 * the only way to find out was to go and look — which, for a business whose
 * whole funnel is "customer asks, human answers", meant the response time was
 * however long it took somebody to remember.
 *
 * Called by `dispatch_owner_alerts()` on a one-minute sweep, never directly by
 * a trigger: an INSERT must not be able to fail because an email provider is
 * unreachable.
 *
 * Request: POST { event, detail }
 *   event: "new_enquiry" | "trade_enquiry" | "quote_accepted" | "stale_enquiry"
 *
 * Service-role only. There is no end user in the loop for any of these.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { resolveOwnerEmail } from "../_shared/owner-recipient.ts";
import { OWNER_LINKS } from "../_shared/links.ts";
import {
  btn,
  esc,
  eyebrow,
  facts,
  h1,
  hr,
  ownerWrapper,
  p,
  small,
} from "../_shared/email-template.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("ALERT_FROM") ?? "Drive Precise <alerts@driveprecise.co.uk>";

type AlertEvent =
  | "new_enquiry"
  | "trade_enquiry"
  | "quote_accepted"
  | "stale_enquiry";

interface Detail {
  [key: string]: unknown;
}

function money(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `£${n.toFixed(2)}`;
}

/** "in 3 hours" reads better than a timestamp on a phone in a driveway. */
function waitingFor(since: unknown): string | null {
  if (typeof since !== "string") return null;
  const then = Date.parse(since);
  if (Number.isNaN(then)) return null;
  const hours = Math.floor((Date.now() - then) / 3_600_000);
  if (hours < 1) return "less than an hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function build(event: AlertEvent, d: Detail): { subject: string; html: string } {
  switch (event) {
    case "new_enquiry": {
      const ref = esc(d.reference ?? "");
      return {
        subject: `New quote request — ${d.registration ?? "vehicle"} (${ref})`,
        html: ownerWrapper(
          eyebrow("New quote request") +
            h1(`${d.customer_name ?? "Someone"} wants a price`) +
            facts([
              ["Reference", d.reference as string],
              ["Vehicle", d.registration as string],
              ["Phone", d.phone as string],
              ["Postcode", d.postcode as string],
              ["Indicative", money(d.indicative_total_gbp)],
              ["Preferred", d.preferred_date as string],
              ["Window", d.preferred_window as string],
            ]) +
            p("The basket total above is what the website showed them. It is not a quote — the firm price is yours to set once you know the car.") +
            btn("Open in Portal", OWNER_LINKS.enquiries),
        ),
      };
    }

    case "quote_accepted": {
      return {
        subject: `Quote accepted — ${d.registration ?? "vehicle"} (${esc(d.reference ?? "")})`,
        html: ownerWrapper(
          eyebrow("Quote accepted") +
            h1(`${d.customer_name ?? "A customer"} has said yes`) +
            facts([
              ["Reference", d.reference as string],
              ["Vehicle", d.registration as string],
              ["Phone", d.phone as string],
              ["Quoted", money(d.quoted_total_gbp)],
            ]) +
            p("Next step is agreeing a date and getting the parts ordered.") +
            btn("Open in Portal", OWNER_LINKS.enquiries),
        ),
      };
    }

    case "trade_enquiry": {
      return {
        subject: `Trade enquiry — ${d.business_name ?? "new business"}`,
        html: ownerWrapper(
          eyebrow("Trade account") +
            h1(`${d.business_name ?? "A business"} wants a trade account`) +
            facts([
              ["Business", d.business_name as string],
              ["Contact", d.contact_name as string],
              ["Phone", d.phone as string],
              ["Postcode", d.business_postcode as string],
              ["Vehicles / month", d.vehicles_per_month as string],
            ]) +
            btn("Open in Portal", OWNER_LINKS.trade),
        ),
      };
    }

    case "stale_enquiry": {
      const waited = waitingFor(d.waiting_since);
      return {
        subject: `Still waiting — ${d.customer_name ?? "a customer"} (${esc(d.reference ?? "")})`,
        html: ownerWrapper(
          eyebrow("Nobody has replied") +
            h1(`${d.customer_name ?? "A customer"} has been waiting${waited ? ` ${waited}` : ""}`) +
            facts([
              ["Reference", d.reference as string],
              ["Vehicle", d.registration as string],
              ["Phone", d.phone as string],
              ["Waiting", waited],
            ]) +
            p("This enquiry is still marked new. Most people who ask for a price ask more than one garage.") +
            btn("Open in Portal", OWNER_LINKS.enquiries) +
            hr() +
            small("You can turn this reminder off in the Portal under Settings."),
        ),
      };
    }
  }
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    // Service role only. The dispatcher presents the key; nothing else should
    // be able to make this business send itself mail.
    const auth = req.headers.get("Authorization") ?? "";
    if (auth.replace("Bearer ", "").trim() !== SERVICE_KEY) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { event, detail } = await req.json();

    const known: AlertEvent[] = [
      "new_enquiry",
      "trade_enquiry",
      "quote_accepted",
      "stale_enquiry",
    ];
    if (!known.includes(event)) {
      return jsonResponse({ error: `Unknown event: ${String(event)}` }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const owner = await resolveOwnerEmail(supabase, `notify-owner:${event}`);

    if (!owner.email) {
      // Reported rather than thrown: the queue row is already marked sent, and
      // retrying forever against a missing address helps nobody. The console
      // error from resolveOwnerEmail is the signal.
      return jsonResponse({ skipped: "no owner address", source: owner.source });
    }

    const { subject, html } = build(event as AlertEvent, (detail ?? {}) as Detail);

    if (!RESEND_KEY) {
      console.error("[notify-owner] RESEND_API_KEY unset — nothing was sent.");
      return jsonResponse({ skipped: "no mail provider configured" }, 200);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [owner.email], subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[notify-owner] send failed (${res.status}): ${body.slice(0, 300)}`);
      return jsonResponse({ error: "send failed", status: res.status }, 502);
    }

    return jsonResponse({ sent: true, event, to: owner.email, source: owner.source });
  } catch (err) {
    console.error("[notify-owner]", err);
    return jsonResponse({ error: (err as Error).message }, 400);
  }
});
