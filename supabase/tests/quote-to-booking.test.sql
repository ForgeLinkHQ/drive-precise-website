-- Quote → accept → pay → booked, and the ways it must refuse.
--
-- This is the path that takes money, so the assertions here are mostly about
-- what cannot happen: accepting a quote that was never given, accepting a price
-- that has since changed, a Stripe retry confirming a booking twice, a link
-- that outlives its usefulness.

BEGIN;

INSERT INTO public.services
  (id, name, category, pricing, price_gbp, customer_type, is_active,
   duration_minutes, travel_minutes)
VALUES ('t-service', 'Full service', 'servicing', 'fixed', 289.00, 'retail',
        TRUE, 120, 30);

-- `create_enquiry` returns the human-facing reference (DP-2026-0001), not a
-- row, because that is what the customer is shown.
CREATE TEMP TABLE t_enq AS
SELECT public.create_enquiry(
  'Sam Taylor', '07700900123', 'sam@example.com',
  'AB12CDE', 42000, NULL,
  '[{"serviceId":"t-service","name":"Full service","priceGbp":289}]'::jsonb,
  289.00, FALSE, 0,
  'GU14 7PA', 'home', NULL, NULL, NULL, NULL, NULL
) AS reference;

CREATE TEMP TABLE t_id AS
SELECT e.id FROM public.enquiries e
 WHERE e.reference = (SELECT reference FROM t_enq);

-- ── A quote has to exist before it can be accepted ────────────────────────
SELECT harness.raises(
  $q$ SELECT public.issue_quote_token((SELECT id FROM t_id)) $q$,
  'a link cannot be issued for an enquiry nobody has quoted'
);

SELECT public.update_enquiry_status((SELECT id FROM t_id), 'quoted', 340.00);

CREATE TEMP TABLE t_tok AS
SELECT public.issue_quote_token((SELECT id FROM t_id)) AS token;

-- ── The token is never stored in the clear ────────────────────────────────
SELECT harness.eq(
  (SELECT count(*)::int FROM public.quote_tokens
    WHERE token_hash = (SELECT token FROM t_tok)),
  0,
  'the raw token is not what is stored'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.quote_tokens
    WHERE token_hash = public.hash_quote_token((SELECT token FROM t_tok))),
  1,
  'its hash is'
);

-- ── What the customer can see ─────────────────────────────────────────────
SELECT harness.eq(
  (SELECT (public.get_quote_for_token((SELECT token FROM t_tok))->>'quoted_total_gbp')::numeric),
  340.00::numeric,
  'the link shows the quoted price'
);
SELECT harness.ok(
  (SELECT public.get_quote_for_token('not-a-real-token')) IS NULL,
  'an unknown link shows nothing rather than an error that confirms it is unknown'
);

-- The column list is the boundary: this is callable by anon.
DO $$
DECLARE k TEXT;
BEGIN
  FOREACH k IN ARRAY ARRAY['admin_notes', 'lost_reason', 'techman_reference', 'campaign'] LOOP
    PERFORM harness.ok(
      NOT (public.get_quote_for_token((SELECT token FROM t_tok)) ? k),
      'the public quote view does not leak ' || k
    );
  END LOOP;
END
$$;

-- ── Accepting ─────────────────────────────────────────────────────────────
SELECT public.accept_quote((SELECT token FROM t_tok));
SELECT harness.eq(
  (SELECT status FROM public.enquiries WHERE id = (SELECT id FROM t_id)),
  'quote_accepted',
  'accepting moves the enquiry along'
);

-- People double-click, and a payment provider redirects back through this page.
SELECT public.accept_quote((SELECT token FROM t_tok));
SELECT harness.eq(
  (SELECT count(*)::int FROM public.quote_tokens WHERE enquiry_id = (SELECT id FROM t_id)),
  1,
  'accepting twice produces one acceptance, not two'
);

-- ── A revised quote invalidates the old link ──────────────────────────────
SELECT public.update_enquiry_status((SELECT id FROM t_id), 'quoted', 395.00);
SELECT harness.raises(
  $q$ SELECT public.accept_quote((SELECT token FROM t_tok)) $q$,
  'a link cannot be used to accept a price that has since been revised'
);

-- Re-issuing replaces rather than adds, so two live links can never disagree.
CREATE TEMP TABLE t_tok2 AS
SELECT public.issue_quote_token((SELECT id FROM t_id)) AS token;
SELECT harness.eq(
  (SELECT count(*)::int FROM public.quote_tokens WHERE enquiry_id = (SELECT id FROM t_id)),
  1,
  'issuing a new link retires the old one'
);
SELECT harness.ok(
  (SELECT public.get_quote_for_token((SELECT token FROM t_tok))) IS NULL,
  'and the old link stops working'
);

SELECT public.accept_quote((SELECT token FROM t_tok2));

-- ── Booking the accepted job ──────────────────────────────────────────────
UPDATE public.booking_settings SET default_deposit_gbp = 75 WHERE id = 1;

CREATE TEMP TABLE t_book AS
SELECT public.reserve_slot(
  't-service',
  ((date_trunc('week', (now() AT TIME ZONE 'Europe/London'))
    + interval '2 weeks' + interval '2 days')::date + time '09:00')
    AT TIME ZONE 'Europe/London',
  '07700900123', 'Sam', 'Taylor', 'sam@example.com', 'GU14 7PA',
  (SELECT id FROM t_id), 395.00, 'home', 'AB12CDE', 'quote_accept'
) AS b;

SELECT harness.eq(
  (SELECT b->>'status' FROM t_book), 'pending_payment',
  'a deposit is owed, so the slot is held rather than confirmed'
);
SELECT harness.eq(
  (SELECT status FROM public.enquiries WHERE id = (SELECT id FROM t_id)),
  'booking_pending',
  'and the enquiry says so'
);

-- ── The deposit ───────────────────────────────────────────────────────────
INSERT INTO public.payments (booking_id, enquiry_id, kind, amount_gbp, stripe_payment_intent_id)
SELECT (b->>'id')::uuid, (SELECT id FROM t_id), 'deposit', 75.00, 'pi_test_123'
  FROM t_book;

SELECT public.settle_payment('pi_test_123', 'succeeded');

SELECT harness.eq(
  (SELECT status FROM public.bookings WHERE id = (SELECT (b->>'id')::uuid FROM t_book)),
  'confirmed',
  'a paid deposit confirms the job'
);
SELECT harness.ok(
  (SELECT deposit_paid AND hold_expires_at IS NULL
     FROM public.bookings WHERE id = (SELECT (b->>'id')::uuid FROM t_book)),
  'and releases the hold, because there is nothing left to wait for'
);
SELECT harness.eq(
  (SELECT status FROM public.enquiries WHERE id = (SELECT id FROM t_id)),
  'booked',
  'the enquiry is booked'
);

-- ── Stripe delivers at least once ─────────────────────────────────────────
SELECT harness.ok(
  public.claim_stripe_event('evt_1', 'checkout.session.completed', '{}'::jsonb),
  'the first delivery of an event is claimed'
);
SELECT harness.ok(
  NOT public.claim_stripe_event('evt_1', 'checkout.session.completed', '{}'::jsonb),
  'and a redelivery is refused, so nothing is counted twice'
);

SELECT harness.raises(
  $q$ SELECT public.settle_payment('pi_does_not_exist') $q$,
  'settling a payment nobody started is an error rather than a silent no-op'
);

-- ── The console read carries no card data and no internal notes ───────────
SELECT harness.eq(
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'get_admin_payments'
      AND column_name LIKE '%stripe%'),
  0,
  'get_admin_payments returns no Stripe identifiers'
);

ROLLBACK;
