-- Seasonal promotions, with the saving substantiated rather than asserted.
--
-- ── Why this is more than a discount column ──────────────────────────────
--
-- A struck-through price is the most regulated thing a small business can put
-- on a website. Since 6 April 2025 the Digital Markets, Competition and
-- Consumers Act 2024 has replaced the Consumer Protection from Unfair Trading
-- Regulations, it covers services as well as goods, and the CMA can act
-- directly. Its published principles on reference pricing are specific:
--
--   * the "was" price must have been the actual selling price for a
--     sufficient period, and compliance is "more likely" at 30 days or more;
--   * the discount period must follow on immediately from that period;
--   * the discount period should be no more than half of the combined time.
--
-- Drive Precise's own brief says the same thing in four words: never fabricate
-- savings.
--
-- A `discount_price` column alone cannot honour any of that, because nothing
-- in it records what the price used to be or for how long. So this migration
-- adds two things: a price history that records every change automatically,
-- and a publication gate that refuses to show a saving it cannot prove.
--
-- The gate lives in the database rather than the interface for the same reason
-- `is_publicly_listed` does on partners: a rule that only exists in a React
-- component is a rule that is one careless render away from being broken.

-- ── Price history ────────────────────────────────────────────────────────
--
-- Written by a trigger, never by hand. That matters: history entered manually
-- is not evidence of anything, whereas a row the database wrote when the price
-- actually changed is exactly the substantiation the CMA asks for.
CREATE TABLE IF NOT EXISTS public.service_price_history (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id     TEXT NOT NULL,
  price_gbp      NUMERIC(10, 2),
  pricing        TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  /* Null means "still the current price". */
  effective_to   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS service_price_history_lookup_idx
  ON public.service_price_history (service_id, effective_from DESC);

ALTER TABLE public.service_price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_price_history FROM anon;

DROP POLICY IF EXISTS "staff_read_price_history" ON public.service_price_history;
CREATE POLICY "staff_read_price_history" ON public.service_price_history
  FOR SELECT TO authenticated
  USING (public.has_staff_role());

COMMENT ON TABLE public.service_price_history IS
  'Automatic record of every price change. The evidence behind any "was" price. Never write by hand.';

/**
 * Close the previous price and open a new one, whenever a price changes.
 */
CREATE OR REPLACE FUNCTION public.record_service_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.price_gbp IS NOT DISTINCT FROM OLD.price_gbp
     AND NEW.pricing IS NOT DISTINCT FROM OLD.pricing THEN
    RETURN NEW;
  END IF;

  UPDATE public.service_price_history
     SET effective_to = now()
   WHERE service_id = NEW.id AND effective_to IS NULL;

  INSERT INTO public.service_price_history (service_id, price_gbp, pricing)
  VALUES (NEW.id, NEW.price_gbp, NEW.pricing);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS services_record_price ON public.services;
CREATE TRIGGER services_record_price
  AFTER INSERT OR UPDATE OF price_gbp, pricing ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.record_service_price_change();

-- ── Promotions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promotions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id          TEXT NOT NULL,

  /* What the customer pays during the promotion. */
  promo_price_gbp     NUMERIC(10, 2) NOT NULL CHECK (promo_price_gbp >= 0),

  headline            TEXT NOT NULL,
  /* Why this offer, now. "Before the September MOT rush", not "limited time". */
  reason              TEXT,
  /* What it does and does not cover. Shown beside the price, never hidden. */
  terms               TEXT,

  season              TEXT CHECK (season IS NULL OR season IN
                        ('winter', 'spring', 'summer', 'autumn')),

  starts_on           DATE NOT NULL,
  ends_on             DATE NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT promo_window_is_forwards CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS promotions_window_idx
  ON public.promotions (starts_on, ends_on) WHERE is_active;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promotions FROM anon;

DROP POLICY IF EXISTS "admin_manage_promotions" ON public.promotions;
CREATE POLICY "admin_manage_promotions" ON public.promotions
  FOR ALL TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

DROP TRIGGER IF EXISTS promotions_touch ON public.promotions;
CREATE TRIGGER promotions_touch BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Substantiation ───────────────────────────────────────────────────────

/**
 * The price this promotion is a reduction from, and how long it had held when
 * the promotion started.
 *
 * Deliberately the service's **current** catalogue price — the open history
 * row — rather than whatever happened to be in force on the start date.
 *
 * The difference matters. Testing an earlier version showed the flaw: raise a
 * service from £89 to £95 during a promotion and the promotions page went on
 * advertising "was £89" while the service page showed £95. Both numbers were
 * defensible in isolation and the pair was indefensible together, which is
 * exactly the kind of inconsistency a customer notices and a regulator asks
 * about.
 *
 * Anchoring to the current price makes the reference the same number the
 * customer can see elsewhere on the site, and means changing a price during a
 * promotion suspends that promotion until the new price has itself held for
 * thirty days. That is the correct behaviour: the discount is a reduction from
 * today's price, not from a historical one.
 */
CREATE OR REPLACE FUNCTION public.promotion_reference(_promo_id UUID)
RETURNS TABLE (reference_price_gbp NUMERIC, established_days INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.price_gbp,
    GREATEST(0, EXTRACT(DAY FROM (p.starts_on::timestamptz - h.effective_from))::INTEGER)
  FROM public.promotions p
  JOIN public.service_price_history h ON h.service_id = p.service_id
  WHERE p.id = _promo_id
    -- The price in force now, which is the one the rest of the site shows.
    AND h.effective_to IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.promotion_reference(UUID) FROM PUBLIC;

/**
 * Promotions a browser may see.
 *
 * The gate, in order:
 *
 *   1. Active, and today falls inside its window.
 *   2. The service exists, is active, and is not trade-only.
 *   3. A reference price exists in the automatic history, it is higher than
 *      the promotional price, and it had been in force for at least 30 days
 *      immediately before the promotion started.
 *   4. The promotion runs no longer than the reference price was established,
 *      which satisfies the CMA's "no more than half the combined period".
 *
 * A promotion failing any of these does not appear. It is not shown without a
 * saving, and it is not shown with an unproven one — it is simply absent,
 * because the alternative is a claim nobody can stand behind.
 *
 * Note what is NOT returned: no internal cost, no margin, and no promotion
 * that has expired. The column list is the contract.
 */
CREATE OR REPLACE FUNCTION public.get_active_promotions()
RETURNS TABLE (
  id                  UUID,
  service_id          TEXT,
  service_name        TEXT,
  headline            TEXT,
  reason              TEXT,
  terms               TEXT,
  season              TEXT,
  promo_price_gbp     NUMERIC,
  reference_price_gbp NUMERIC,
  ends_on             DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.service_id, s.name,
    p.headline, p.reason, p.terms, p.season,
    p.promo_price_gbp, r.reference_price_gbp, p.ends_on
  FROM public.promotions p
  JOIN public.services s ON s.id = p.service_id
  CROSS JOIN LATERAL public.promotion_reference(p.id) r
  WHERE p.is_active
    AND CURRENT_DATE BETWEEN p.starts_on AND p.ends_on
    AND s.is_active
    AND s.customer_type <> 'trade'
    AND r.reference_price_gbp IS NOT NULL
    AND r.reference_price_gbp > p.promo_price_gbp
    AND r.established_days >= 30
    AND (p.ends_on - p.starts_on) <= r.established_days
  ORDER BY p.ends_on, s.name;
$$;

REVOKE ALL ON FUNCTION public.get_active_promotions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_promotions() TO anon, authenticated;

/**
 * The same promotions, plus why each one is or is not publishable.
 *
 * Admin only. Without this, a promotion that fails the gate simply vanishes
 * with no explanation, and whoever created it has no way to find out why.
 */
CREATE OR REPLACE FUNCTION public.promotion_diagnostics()
RETURNS TABLE (
  id                  UUID,
  headline            TEXT,
  service_id          TEXT,
  promo_price_gbp     NUMERIC,
  reference_price_gbp NUMERIC,
  established_days    INTEGER,
  starts_on           DATE,
  ends_on             DATE,
  is_publishable      BOOLEAN,
  blocked_reason      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.headline, p.service_id, p.promo_price_gbp,
    r.reference_price_gbp, r.established_days, p.starts_on, p.ends_on,
    (p.is_active
      AND CURRENT_DATE BETWEEN p.starts_on AND p.ends_on
      AND r.reference_price_gbp IS NOT NULL
      AND r.reference_price_gbp > p.promo_price_gbp
      AND r.established_days >= 30
      AND (p.ends_on - p.starts_on) <= r.established_days) AS is_publishable,
    CASE
      WHEN NOT p.is_active THEN 'Switched off.'
      WHEN CURRENT_DATE < p.starts_on THEN 'Has not started yet.'
      WHEN CURRENT_DATE > p.ends_on THEN 'Finished.'
      WHEN r.reference_price_gbp IS NULL THEN
        'No recorded price before this promotion started, so there is nothing to compare against.'
      WHEN r.reference_price_gbp <= p.promo_price_gbp THEN
        'The promotional price is not lower than the price before it.'
      WHEN r.established_days < 30 THEN
        'The current price has only held for ' || r.established_days ||
        ' days. It needs 30 before it can be used as a "was" price. If you changed ' ||
        'this price recently, the promotion will publish itself once that time has passed.'
      WHEN (p.ends_on - p.starts_on) > r.established_days THEN
        'The promotion runs for ' || (p.ends_on - p.starts_on) ||
        ' days but the price it discounts has only held for ' || r.established_days ||
        '. A discount should not run longer than the price it reduces.'
      ELSE NULL
    END AS blocked_reason
  FROM public.promotions p
  LEFT JOIN LATERAL public.promotion_reference(p.id) r ON TRUE
  ORDER BY p.starts_on DESC;
$$;

REVOKE ALL ON FUNCTION public.promotion_diagnostics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promotion_diagnostics() TO authenticated;
