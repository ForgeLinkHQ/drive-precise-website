/**
 * Edge function: turn an accepted quote into a payment link.
 *
 * This is the only place on this site where money is asked for, and it sits
 * deliberately far down the funnel. Nothing on the public site is payable: a
 * quote request is free, the price is set by a human who has seen the vehicle,
 * and only once the customer has accepted that price does a deposit become
 * owed. That is `paymentPoint: "on_quote_accept"`.
 *
 * Request: POST { token, slot_starts_at?, service_id?, service_location? }
 *
 * The token is the quote-acceptance link, so no session and no account are
 * needed — the person paying is a member of the public who was emailed a
 * price. That makes the token the whole authorisation, and it is why this
 * function derives *everything* from it rather than trusting the body:
 *
 *   * the amount comes from `accept_quote`, never from the request. A caller
 *     supplying their own deposit figure is the obvious attack and the answer
 *     is not to accept the field at all.
 *   * the enquiry comes from the token, so one link cannot pay for another
 *     customer's job.
 *
 * Env: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { SITE_URL } from "../_shared/links.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY");

interface Body {
  token?: string;
  /** ISO timestamp of the slot being held, when one is being booked. */
  slot_starts_at?: string;
  service_id?: string;
  service_location?: string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!STRIPE_KEY) {
    // Said plainly rather than as a 500. A site with no Stripe account
    // configured is a supported state — it takes quotes and invoices on
    // completion — and the front end can offer that instead.
    return jsonResponse({ error: "payments_not_configured" }, 503);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const token = typeof body.token === "string" ? body.token : null;
  if (!token) return jsonResponse({ error: "Missing token" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Accepting is idempotent, so calling it here is safe whether or not the
  // customer already pressed accept on the page. It is also the only source of
  // the amount.
  const { data: accepted, error: acceptError } = await db.rpc("accept_quote", {
    p_token: token,
  });
  if (acceptError || !accepted) {
    return jsonResponse(
      { error: acceptError?.message ?? "invalid_or_expired_link" },
      400,
    );
  }

  const enquiryId = accepted.enquiry_id as string;
  const quotedTotal = Number(accepted.quoted_total_gbp);
  const reference = accepted.reference as string;

  // Hold the slot before asking for money. The reservation is what creates the
  // booking the payment will confirm, and doing it the other way round means a
  // customer can pay for a slot somebody else has taken in the meantime.
  let bookingId: string | null = null;
  let depositGbp = 0;

  if (body.slot_starts_at && body.service_id) {
    const { data: quote } = await db.rpc("get_quote_for_token", { p_token: token });

    const { data: booking, error: reserveError } = await db.rpc("reserve_slot", {
      _service_id: body.service_id,
      _starts_at: body.slot_starts_at,
      _phone: quote?.customer_phone ?? "",
      _first_name: (quote?.customer_name ?? "").split(" ")[0] || null,
      _email: null,
      _postcode: quote?.postcode ?? null,
      _enquiry_id: enquiryId,
      _agreed_price_gbp: quotedTotal,
      _service_location: body.service_location ?? quote?.service_location ?? null,
      _registration: quote?.registration ?? null,
      _source: "quote_accept",
    });

    if (reserveError) {
      // These come back as named codes from the database — 'slot_taken',
      // 'too_soon', 'outside_hours' — and the front end turns them into
      // sentences. Passing the code through beats inventing a message here.
      return jsonResponse({ error: reserveError.message }, 409);
    }

    bookingId = booking?.id ?? null;
    depositGbp = Number(booking?.deposit_gbp ?? 0);
  }

  if (depositGbp <= 0) {
    // Nothing to pay. The booking is already confirmed by reserve_slot in that
    // case, so this is a success rather than an error.
    return jsonResponse({ booked: true, booking_id: bookingId, url: null });
  }

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-12-18.acacia" });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: Math.round(depositGbp * 100),
          product_data: {
            name: `Deposit — ${reference}`,
            description: "Deposit to secure your booking with Drive Precise.",
          },
        },
      },
    ],
    // Everything the webhook needs to settle without trusting its own body.
    metadata: {
      enquiry_id: enquiryId,
      booking_id: bookingId ?? "",
      reference,
    },
    success_url: `${SITE_URL}/quote/accepted?ref=${encodeURIComponent(reference)}`,
    cancel_url: `${SITE_URL}/quote/accept?t=${encodeURIComponent(token)}`,
  });

  // Recorded before the customer is sent to Stripe, so a payment that succeeds
  // always has a row waiting for the webhook to settle. The other order leaves
  // a paid customer with nothing in the database to attach it to.
  const { error: paymentError } = await db.from("payments").insert({
    booking_id: bookingId,
    enquiry_id: enquiryId,
    kind: "deposit",
    status: "requires_payment",
    amount_gbp: depositGbp,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === "string"
      ? session.payment_intent
      : null,
  });
  if (paymentError) {
    console.error("[create-checkout-session] payment row failed:", paymentError.message);
    return jsonResponse({ error: "could_not_record_payment" }, 500);
  }

  return jsonResponse({ url: session.url, booking_id: bookingId });
});
