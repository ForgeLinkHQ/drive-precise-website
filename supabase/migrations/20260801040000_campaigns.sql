-- Seasonal campaigns (§37, §45).
--
-- "Allow homepage banners and campaigns to change without code deployment."
-- So the banner is a row, its window is a pair of dates, and the site picks
-- whichever campaign is live right now. There is no publish step and no draft
-- state at V1 — a start date in the future is the draft state, which is one
-- fewer concept for whoever is running this to hold in their head.

CREATE TABLE IF NOT EXISTS public.campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  headline      TEXT NOT NULL,
  body          TEXT,
  cta_label     TEXT,
  /* Where the banner goes. A service id, a package id or a path — the site
     resolves the first two against the catalogue so a campaign can never point
     at a service that has since been switched off. */
  cta_service_id TEXT,
  cta_package_id TEXT,
  cta_path      TEXT,
  tracking_code TEXT,
  starts_on     DATE NOT NULL,
  ends_on       DATE NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT campaign_window_is_forwards CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS campaigns_window_idx
  ON public.campaigns (starts_on, ends_on) WHERE is_active;

DROP TRIGGER IF EXISTS campaigns_touch ON public.campaigns;
CREATE TRIGGER campaigns_touch BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaigns FROM anon;

CREATE POLICY "admin_manage_campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

-- The live campaign, if there is one. Definer for the same reason as the
-- catalogue: the public needs a handful of columns, not the table.
CREATE OR REPLACE FUNCTION public.get_active_campaign()
RETURNS TABLE (
  id             UUID,
  headline       TEXT,
  body           TEXT,
  cta_label      TEXT,
  cta_service_id TEXT,
  cta_package_id TEXT,
  cta_path       TEXT,
  tracking_code  TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.headline, c.body, c.cta_label, c.cta_service_id,
         c.cta_package_id, c.cta_path, c.tracking_code
  FROM public.campaigns c
  WHERE c.is_active
    AND current_date BETWEEN c.starts_on AND c.ends_on
  -- Overlapping campaigns are allowed and the newest wins, rather than the
  -- site rendering two banners or refusing to render either.
  ORDER BY c.starts_on DESC, c.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_campaign() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_campaign() TO anon, authenticated;
