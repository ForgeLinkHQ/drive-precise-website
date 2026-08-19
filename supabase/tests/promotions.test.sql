-- Seasonal promotions: the saving has to be provable, and a blocked offer has
-- to say why.
--
-- These run against a real database because that is the only place the rules
-- actually live. The gate is a WHERE clause in `get_active_promotions()` and a
-- CASE in `promotion_diagnostics()`; no amount of reading the migration text
-- proves the two agree, and the bug this file was written after was exactly
-- that — diagnostics reporting an offer as publishable while the public
-- function filtered it out, because only one of them looked at the service.

BEGIN;

INSERT INTO public.services (id, name, category, pricing, price_gbp, customer_type, is_active)
VALUES ('t-oil', 'Oil service', 'servicing', 'fixed', 189.00, 'retail', TRUE);

-- ── The history is written for you ────────────────────────────────────────
SELECT harness.eq(
  (SELECT count(*)::int FROM public.service_price_history WHERE service_id = 't-oil'),
  1,
  'inserting a service opens a price-history row'
);
SELECT harness.ok(
  (SELECT effective_to IS NULL FROM public.service_price_history WHERE service_id = 't-oil'),
  'the open row is the current price'
);

-- ── A brand new price cannot be discounted from ───────────────────────────
SELECT public.upsert_promotion(
  NULL, 't-oil', 149.00, 'Oil service offer', 'Before the winter rush',
  'Retail only', 'winter', CURRENT_DATE, CURRENT_DATE + 20, TRUE
);

SELECT harness.eq(
  (SELECT count(*)::int FROM public.get_active_promotions()),
  0,
  'a price that has held no time at all cannot be a "was" price'
);
SELECT harness.ok(
  (SELECT blocked_reason LIKE '%30%' FROM public.promotion_diagnostics()),
  'and the console is told it needs thirty days'
);

-- ── Once it has held, it publishes itself ─────────────────────────────────
UPDATE public.service_price_history SET effective_from = now() - interval '40 days';

SELECT harness.eq(
  (SELECT count(*)::int FROM public.get_active_promotions()),
  1,
  'a price established for forty days can be discounted from'
);
SELECT harness.eq(
  (SELECT reference_price_gbp FROM public.get_active_promotions()),
  189.00::numeric,
  'and the "was" price is the one the rest of the site shows'
);
SELECT harness.ok(
  (SELECT is_publishable FROM public.promotion_diagnostics()),
  'diagnostics agrees that it is showing'
);

-- ── The two functions must never disagree ─────────────────────────────────
--
-- This is the regression. `get_active_promotions()` filters on the service
-- being active and not trade-only; `promotion_diagnostics()` did not, and so
-- reported an offer as live while the website showed nothing.
UPDATE public.services SET is_active = FALSE WHERE id = 't-oil';
SELECT harness.eq(
  (SELECT count(*)::int FROM public.get_active_promotions()), 0,
  'a promotion on a switched-off service does not appear'
);
SELECT harness.ok(
  (SELECT NOT is_publishable FROM public.promotion_diagnostics()),
  'and diagnostics does not claim otherwise'
);
SELECT harness.ok(
  (SELECT blocked_reason LIKE '%switched off%' FROM public.promotion_diagnostics()),
  'the reason names the service, not the promotion'
);

UPDATE public.services SET is_active = TRUE, customer_type = 'trade' WHERE id = 't-oil';
SELECT harness.eq(
  (SELECT count(*)::int FROM public.get_active_promotions()), 0,
  'a trade-only service is not promoted on the retail pages'
);
SELECT harness.ok(
  (SELECT NOT is_publishable FROM public.promotion_diagnostics()),
  'and diagnostics agrees about that too'
);

UPDATE public.services SET customer_type = 'retail' WHERE id = 't-oil';

-- ── Raising the price suspends the offer ──────────────────────────────────
--
-- The reference is the *current* catalogue price, so changing it mid-promotion
-- restarts the thirty-day clock. That is the intended behaviour: the discount
-- is a reduction from today's price, not from a historical one, and the
-- alternative is a promotions page advertising a "was" price the service page
-- contradicts.
UPDATE public.services SET price_gbp = 199.00 WHERE id = 't-oil';
SELECT harness.eq(
  (SELECT count(*)::int FROM public.service_price_history WHERE service_id = 't-oil'),
  2,
  'changing a price closes the old history row and opens a new one'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.get_active_promotions()), 0,
  'raising the price mid-promotion suspends it rather than moving the goalposts'
);

-- ── Never a fabricated saving ─────────────────────────────────────────────
UPDATE public.service_price_history SET effective_from = now() - interval '40 days'
  WHERE effective_to IS NULL;
SELECT public.upsert_promotion(
  (SELECT id FROM public.promotions LIMIT 1), NULL, 250.00
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.get_active_promotions()), 0,
  'an "offer" priced above the real price is not an offer'
);
SELECT harness.ok(
  (SELECT blocked_reason LIKE '%not lower%' FROM public.promotion_diagnostics()),
  'and it says so in words the owner can act on'
);

-- ── The write surface refuses nonsense ────────────────────────────────────
SELECT harness.raises(
  $q$ SELECT public.upsert_promotion(NULL, 'no-such-service', 10.00, 'x', NULL, NULL, NULL, CURRENT_DATE, CURRENT_DATE + 1, TRUE) $q$,
  'a promotion cannot be attached to a service that does not exist'
);
SELECT harness.raises(
  $q$ SELECT public.upsert_promotion(NULL, 't-oil', NULL, NULL, NULL, NULL, NULL, NULL, NULL, TRUE) $q$,
  'a new promotion needs the fields that make it one'
);
SELECT harness.raises(
  $q$ SELECT public.set_promotion_active('00000000-0000-0000-0000-000000000000'::uuid, TRUE) $q$,
  'switching on a promotion that does not exist is an error, not a no-op'
);
SELECT harness.raises(
  $q$ INSERT INTO public.promotions (service_id, promo_price_gbp, headline, starts_on, ends_on)
      VALUES ('t-oil', 10.00, 'backwards', CURRENT_DATE + 5, CURRENT_DATE) $q$,
  'a promotion cannot end before it starts'
);

-- ── §60: the console read carries no cost data ────────────────────────────
--
-- The whole reason `promotions` is off the Portal's table allowlist is that the
-- proxy would select every column of whatever it joined. This asserts the
-- function's contract instead: the columns are named, and none of them is a
-- cost.
SELECT harness.eq(
  (SELECT count(*)::int
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'get_admin_promotions'
      AND column_name IN ('parts_cost_gbp', 'consumables_cost_gbp', 'internal_notes')),
  0,
  'get_admin_promotions never returns internal cost data'
);

ROLLBACK;
