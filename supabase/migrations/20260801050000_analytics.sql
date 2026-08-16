-- Commercial analytics (§41).
--
-- §41 asks for business economics, not page views: attachment rate, package
-- upgrade rate, quote-to-booking conversion, revenue per job. Most of those are
-- answered from `enquiries`, which already holds the basket, the indicative
-- total, the quoted total and the lifecycle timestamps. This table adds the
-- half that only the browser can see — the funnel steps before an enquiry
-- exists, which is where basket abandonment lives.
--
-- No cookie, no device id, no identity. `session_key` is generated in the tab
-- and dies with it. A registration is never sent here; it is personal data and
-- has no place in a counter.

CREATE TABLE IF NOT EXISTS public.site_events (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  session_key      TEXT NOT NULL,
  path             TEXT,
  device           TEXT CHECK (device IS NULL OR device IN ('mobile', 'tablet', 'desktop')),
  item_id          TEXT,
  basket_value_gbp NUMERIC(10, 2),
  item_count       INTEGER,
  referral_source  TEXT,
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_events_name_idx ON public.site_events (name, created_at DESC);
CREATE INDEX IF NOT EXISTS site_events_session_idx ON public.site_events (session_key, created_at);
CREATE INDEX IF NOT EXISTS site_events_created_idx ON public.site_events (created_at DESC);

ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_events FROM anon;

CREATE POLICY "staff_read_events" ON public.site_events
  FOR SELECT TO authenticated
  USING (public.has_staff_role());

-- Write path is a definer function, so anon can add to the table without being
-- able to read it. An events table readable by anon would leak the whole
-- funnel, campaign codes included, to anyone with the publishable key.
CREATE OR REPLACE FUNCTION public.record_site_event(
  _name             TEXT,
  _session_key      TEXT,
  _path             TEXT,
  _device           TEXT,
  _item_id          TEXT,
  _basket_value_gbp NUMERIC,
  _item_count       INTEGER,
  _referral_source  TEXT,
  _utm_source       TEXT,
  _utm_medium       TEXT,
  _utm_campaign     TEXT,
  _meta             JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bound everything. This endpoint is open to the internet and a counter is
  -- never worth an unbounded write.
  IF _name IS NULL OR length(_name) > 64 THEN RETURN; END IF;
  IF _session_key IS NULL OR length(_session_key) > 64 THEN RETURN; END IF;
  IF _meta IS NOT NULL AND length(_meta::TEXT) > 2000 THEN RETURN; END IF;

  INSERT INTO public.site_events (
    name, session_key, path, device, item_id, basket_value_gbp, item_count,
    referral_source, utm_source, utm_medium, utm_campaign, meta
  ) VALUES (
    _name, _session_key, left(coalesce(_path, ''), 300), _device,
    left(coalesce(_item_id, ''), 80), _basket_value_gbp, _item_count,
    left(coalesce(_referral_source, ''), 40), left(coalesce(_utm_source, ''), 80),
    left(coalesce(_utm_medium, ''), 80), left(coalesce(_utm_campaign, ''), 120),
    coalesce(_meta, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  -- Analytics must never be able to fail a customer's page.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.record_site_event(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_site_event(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB
) TO anon, authenticated;

-- ── Reporting ────────────────────────────────────────────────────────────

-- The enquiry funnel, by day. Everything here comes from records rather than
-- from browser events, so it is the number Drive Precise can rely on.
CREATE OR REPLACE VIEW public.enquiry_funnel_daily
WITH (security_invoker = true) AS
  SELECT
    date_trunc('day', created_at)::DATE AS day,
    count(*) AS enquiries,
    count(*) FILTER (WHERE status <> 'new') AS contacted,
    count(*) FILTER (WHERE quoted_at IS NOT NULL) AS quoted,
    count(*) FILTER (WHERE booked_at IS NOT NULL) AS booked,
    count(*) FILTER (WHERE status = 'completed') AS completed,
    count(*) FILTER (WHERE status = 'lost') AS lost,
    round(avg(indicative_total_gbp) FILTER (WHERE indicative_total_gbp > 0), 2)
      AS avg_initial_basket_gbp,
    round(avg(quoted_total_gbp) FILTER (WHERE quoted_total_gbp IS NOT NULL), 2)
      AS avg_quoted_gbp
  FROM public.enquiries
  GROUP BY 1
  ORDER BY 1 DESC;

-- Add-on attachment (§41: "add-on attachment rate", "most successful add-on").
-- Reads the frozen basket on each enquiry, so it reflects what customers
-- actually asked for rather than what they were shown.
CREATE OR REPLACE VIEW public.service_attachment
WITH (security_invoker = true) AS
  SELECT
    item ->> 'id' AS service_id,
    item ->> 'name' AS service_name,
    count(*) AS times_requested,
    count(*) FILTER (WHERE e.booked_at IS NOT NULL) AS times_booked,
    round(
      100.0 * count(*) FILTER (WHERE e.booked_at IS NOT NULL) / NULLIF(count(*), 0),
      1
    ) AS booked_rate_pct
  FROM public.enquiries e
  CROSS JOIN LATERAL jsonb_array_elements(e.items) AS item
  GROUP BY 1, 2
  ORDER BY times_requested DESC;

REVOKE ALL ON public.enquiry_funnel_daily FROM anon;
REVOKE ALL ON public.service_attachment FROM anon;
GRANT SELECT ON public.enquiry_funnel_daily TO authenticated;
GRANT SELECT ON public.service_attachment TO authenticated;
