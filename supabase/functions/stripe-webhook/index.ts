/**
 * Edge function: Stripe tells us the deposit landed.
 *
 * Handles:
 *   checkout.session.completed → settle the payment, confirm the booking
 *   charge.refunded            → record the refund
 *
 * ── Why the signature check is not optional ──
 *
 * This endpoint has to be public — Stripe calls it, and Stripe has no Supabase
 * session. So the only thing separating a real payment notification from
 * somebody posting JSON at the URL is the signature. Without it, confirming a
 * booking would be a matter of guessing a booking id.
 *
 * ── Why the event is claimed before it is acted on ──
 *
 * Stripe guarantees at-least-once delivery and will resend anything it thinks
 * failed, including something that succeeded slowly. `claim_stripe_event`
 * inserts into a primary-keyed ledger and returns false if the row was already
 * there, so a redelivery stops at the first branch and cannot confirm a booking
 * twice or record a deposit twice.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

import { corsHeadersWith } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

const cors = corsHeadersWith("stripe-signature");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!STRIPE_KEY || !WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET unset");
    return json({ error: "not_configured" }, 503);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing stripe-signature header" }, 400);

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-12-18.acacia" });
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return json({ error: "Invalid signature" }, 400);
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: claimed, error: claimError } = await db.rpc("claim_stripe_event", {
    p_event_id: event.id,
    p_type: event.type,
    p_payload: event.data.object as unknown as Record<string, unknown>,
  });
  if (claimError) {
    // Returning 500 makes Stripe retry, which is what we want: the alternative
    // is acknowledging an event that was never recorded.
    console.error("[stripe-webhook] could not claim event:", claimError.message);
    return json({ error: "claim_failed" }, 500);
  }
  if (claimed === false) {
    return json({ ok: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const intentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : null;

        // The row was written with the session id before the customer was sent
        // to Stripe; the intent id only exists now, so it is filled in here and
        // the settle is keyed on it.
        if (intentId) {
          await db
            .from("payments")
            .update({ stripe_payment_intent_id: intentId })
            .eq("stripe_checkout_session_id", session.id);

          const { error } = await db.rpc("settle_payment", {
            p_payment_intent_id: intentId,
            p_status: "succeeded",
          });
          if (error) throw new Error(error.message);
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        // The hold lapses on its own via cancel_expired_holds; marking the
        // payment keeps the money side honest about what happened.
        await db
          .from("payments")
          .update({ status: "failed" })
          .eq("stripe_checkout_session_id", session.id);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const intentId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : null;
        if (intentId) {
          const { error } = await db.rpc("settle_payment", {
            p_payment_intent_id: intentId,
            p_status: "refunded",
          });
          if (error) throw new Error(error.message);
        }
        break;
      }

      default:
        // Acknowledged and ignored. Stripe sends a great many event types and
        // 400ing on the ones we did not ask for makes the dashboard look
        // broken for no reason.
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] handling ${event.type} failed:`, err);
    return json({ error: "handler_failed" }, 500);
  }

  return json({ ok: true });
});
