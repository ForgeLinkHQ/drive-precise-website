-- The Portal's way in to seasonal promotions, without the table.
--
-- `promotions` is deliberately not on the Portal's table allowlist, and the
-- reason is the same one that keeps `services` off it: the proxy holds a
-- service-role key that ignores this database's row-level security and selects
-- every column when a page does not name them. For the catalogue the risk is
-- margin data leaking to staff. Here it is worse in kind — a "was" price is a
-- regulated claim, and `service_price_history` is the evidence for it. A table
-- proxy that can write `promotions` and read history rows is a table proxy that
-- can manufacture a saving, which is the one thing this feature exists to make
-- impossible.
--
-- So the console gets functions that name their columns, and the table stays
-- unreachable. Four of them: one read, two writes and a delete.
--
-- Three things to know about how these are secured.
--
--   * No `has_admin_role()` check inside them. The Portal calls through a
--     service-role key, where `auth.uid()` is null and that helper is always
--     false — gating on it would refuse the only caller these exist for. The
--     Portal enforces its own org role before calling a write RPC and writes an
--     audit row, and this site's own `/admin` is behind `authenticated` with no
--     public sign-up. Same reasoning as `update_enquiry_status()`, which is the
--     established pattern here.
--
--   * `GRANT EXECUTE … TO service_role` explicitly on every one. Supabase's
--     default privileges would usually cover it, but every other Portal-facing
--     function in this repo names the role, and a grant you can read is worth
--     more than one you have to infer.
--
--   * The substantiation gate is not restated. Publishability is computed in
--     one place — `promotion_reference()` — and both the public read and the
--     admin read go through it. A second copy of those rules would be a second
--     thing to keep in step with the CMA's guidance.

-- ============================================================
-- 1. DIAGNOSTICS, CORRECTED
-- ============================================================
--
-- `promotion_diagnostics()` answers "why is this offer not showing?", and it
-- was answering it incompletely: it never looked at the service. A promotion on
-- a service that has been deactivated, or one that is trade-only, is filtered
-- out by `get_active_promotions()` and would still have been reported here as
-- publishable — the page would say the offer is live and the website would show
-- nothing, which is precisely the confusion this function exists to prevent.
--
-- The two conditions are added to both the boolean and the explanation, in the
-- same order the public function applies them.
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
      AND s.id IS NOT NULL
      AND s.is_active
      AND s.customer_type <> 'trade'
      AND CURRENT_DATE BETWEEN p.starts_on AND p.ends_on
      AND r.reference_price_gbp IS NOT NULL
      AND r.reference_price_gbp > p.promo_price_gbp
      AND r.established_days >= 30
      AND (p.ends_on - p.starts_on) <= r.established_days) AS is_publishable,
    CASE
      WHEN NOT p.is_active THEN 'Switched off.'
      WHEN s.id IS NULL THEN
        'The service this promotion is attached to no longer exists.'
      WHEN NOT s.is_active THEN
        'The service this promotion is attached to is switched off, so the offer has nowhere to appear.'
      WHEN s.customer_type = 'trade' THEN
        'This is a trade-only service, and promotions are shown on the retail pages.'
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
  LEFT JOIN public.services s ON s.id = p.service_id
  LEFT JOIN LATERAL public.promotion_reference(p.id) r ON TRUE
  ORDER BY p.starts_on DESC;
$$;

REVOKE ALL ON FUNCTION public.promotion_diagnostics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promotion_diagnostics() TO authenticated, service_role;

-- ============================================================
-- 2. THE CONSOLE'S READ
-- ============================================================
--
-- Everything needed to list and edit a promotion, plus everything needed to
-- explain it. One call rather than a table read joined to a diagnostics call,
-- because the two must never disagree about the same row.
--
-- `service_name` comes from the catalogue and is the only column taken from it.
-- Naming it here is what lets the Portal show "Winter oil service" without
-- being handed `parts_cost_gbp` alongside (§60).
CREATE OR REPLACE FUNCTION public.get_admin_promotions()
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
  established_days    INTEGER,
  starts_on           DATE,
  ends_on             DATE,
  is_active           BOOLEAN,
  is_publishable      BOOLEAN,
  blocked_reason      TEXT,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.service_id, s.name,
    p.headline, p.reason, p.terms, p.season,
    p.promo_price_gbp, d.reference_price_gbp, d.established_days,
    p.starts_on, p.ends_on, p.is_active,
    d.is_publishable, d.blocked_reason,
    p.created_at, p.updated_at
  FROM public.promotions p
  LEFT JOIN public.services s ON s.id = p.service_id
  JOIN public.promotion_diagnostics() d ON d.id = p.id
  ORDER BY p.starts_on DESC;
$$;

REVOKE ALL ON FUNCTION public.get_admin_promotions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_promotions() TO authenticated, service_role;

-- ============================================================
-- 3. CREATE AND EDIT
-- ============================================================
--
-- A null `p_id` creates; anything else edits that row.
--
-- What this deliberately does *not* do is decide whether the offer may be
-- shown. The owner can save whatever they like and the gate decides — which is
-- the right way round, because the gate is the thing that has the price history
-- in front of it. The return value carries `is_publishable` and, when it is
-- false, the plain-English reason, so the console can say "saved, and here is
-- why it is not on the site yet" in a single round trip.
CREATE OR REPLACE FUNCTION public.upsert_promotion(
  p_id              UUID    DEFAULT NULL,
  p_service_id      TEXT    DEFAULT NULL,
  p_promo_price_gbp NUMERIC DEFAULT NULL,
  p_headline        TEXT    DEFAULT NULL,
  p_reason          TEXT    DEFAULT NULL,
  p_terms           TEXT    DEFAULT NULL,
  p_season          TEXT    DEFAULT NULL,
  p_starts_on       DATE    DEFAULT NULL,
  p_ends_on         DATE    DEFAULT NULL,
  p_is_active       BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id  UUID;
  v_out JSONB;
BEGIN
  IF p_id IS NULL THEN
    -- A new promotion needs all of it. Checked here rather than left to the
    -- NOT NULL constraints so the console gets one named error instead of a
    -- Postgres message about a column.
    IF p_service_id IS NULL OR p_promo_price_gbp IS NULL
       OR p_headline IS NULL OR p_starts_on IS NULL OR p_ends_on IS NULL THEN
      RAISE EXCEPTION 'promotion_incomplete' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id) THEN
      RAISE EXCEPTION 'unknown_service' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.promotions (
      service_id, promo_price_gbp, headline, reason, terms, season,
      starts_on, ends_on, is_active
    ) VALUES (
      p_service_id, p_promo_price_gbp, p_headline, p_reason, p_terms, p_season,
      p_starts_on, p_ends_on, COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_id;
  ELSE
    IF p_service_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id) THEN
      RAISE EXCEPTION 'unknown_service' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.promotions
       SET service_id      = COALESCE(p_service_id, service_id),
           promo_price_gbp = COALESCE(p_promo_price_gbp, promo_price_gbp),
           headline        = COALESCE(p_headline, headline),
           -- Nullable prose: passing null leaves it alone, and clearing it is
           -- done by passing an empty string, which the console sends.
           reason          = COALESCE(p_reason, reason),
           terms           = COALESCE(p_terms, terms),
           season          = COALESCE(p_season, season),
           starts_on       = COALESCE(p_starts_on, starts_on),
           ends_on         = COALESCE(p_ends_on, ends_on),
           is_active       = COALESCE(p_is_active, is_active)
     WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'unknown_promotion' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT to_jsonb(g) INTO v_out
    FROM public.get_admin_promotions() g WHERE g.id = v_id;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_promotion(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_promotion(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE, DATE, BOOLEAN)
  TO authenticated, service_role;

-- ============================================================
-- 4. SWITCH ON AND OFF
-- ============================================================
--
-- The common action, separated from the edit so the console's toggle cannot
-- accidentally send a partial row. Returns the same shape, so switching on an
-- offer that still fails the gate tells you so immediately rather than leaving
-- someone to wonder why the website has not changed.
CREATE OR REPLACE FUNCTION public.set_promotion_active(
  p_id        UUID,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out JSONB;
BEGIN
  UPDATE public.promotions SET is_active = p_is_active WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_promotion' USING ERRCODE = 'P0001';
  END IF;

  SELECT to_jsonb(g) INTO v_out
    FROM public.get_admin_promotions() g WHERE g.id = p_id;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.set_promotion_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_promotion_active(UUID, BOOLEAN)
  TO authenticated, service_role;

-- ============================================================
-- 5. DELETE
-- ============================================================
--
-- Only the promotion. `service_price_history` is untouched by design: it is the
-- evidence, it is written by trigger, and a promotion being removed is not a
-- reason to forget what the price used to be.
CREATE OR REPLACE FUNCTION public.delete_promotion(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.promotions WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_promotion' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('id', p_id, 'deleted', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_promotion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_promotion(UUID) TO authenticated, service_role;
