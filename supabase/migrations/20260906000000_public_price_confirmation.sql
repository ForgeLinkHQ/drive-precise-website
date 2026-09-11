-- Price confirmation is not commercial cost data; it is the safety bit that says
-- a displayed fixed price has actually been approved for contractual booking.
--
-- The admin catalogue and Portal both write services.price_confirmed, but the
-- public projection historically omitted it. service-catalog.ts therefore had
-- to force every database row back to false, which meant an approved service
-- could never become self-bookable through TechMan once the database overlay
-- was active. Packages had the same problem for confirmed package pricing.
--
-- Expose only this boolean alongside the already-public price. Cost, margin and
-- internal-note columns remain unreachable.

DROP FUNCTION IF EXISTS public.get_public_services();

CREATE FUNCTION public.get_public_services()
RETURNS TABLE (
  id                   TEXT,
  name                 TEXT,
  category             TEXT,
  short_description    TEXT,
  description          TEXT,
  includes             JSONB,
  pricing              TEXT,
  price_gbp            NUMERIC,
  price_suffix         TEXT,
  price_confirmed      BOOLEAN,
  compare_price_gbp    NUMERIC,
  duration_minutes     INTEGER,
  mobile               TEXT,
  workshop_recommended BOOLEAN,
  collection_available BOOLEAN,
  requires_parts_quote BOOLEAN,
  add_ons              JSONB,
  incompatible_with    JSONB,
  suggests_partner     JSONB,
  seasons              JSONB,
  also_in              JSONB,
  customer_type        TEXT,
  mod_stream           TEXT,
  add_on_only          BOOLEAN,
  featured             BOOLEAN,
  sort_order           INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.name, s.category, s.short_description, s.description, s.includes,
    s.pricing, s.price_gbp, s.price_suffix, s.price_confirmed,
    s.compare_price_gbp, s.duration_minutes, s.mobile, s.workshop_recommended,
    s.collection_available, s.requires_parts_quote, s.add_ons,
    s.incompatible_with, s.suggests_partner, s.seasons, s.also_in,
    s.customer_type, s.mod_stream, s.add_on_only, s.featured, s.sort_order
  FROM public.services s
  WHERE s.is_active
    AND s.customer_type <> 'trade'
    AND s.category <> 'diagnostics'
  ORDER BY s.category, s.sort_order, s.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_services() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_services() TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_public_packages();

CREATE FUNCTION public.get_public_packages()
RETURNS TABLE (
  id                TEXT,
  name              TEXT,
  short_description TEXT,
  description       TEXT,
  includes          JSONB,
  also_includes     JSONB,
  pricing           TEXT,
  price_gbp         NUMERIC,
  price_confirmed   BOOLEAN,
  duration_minutes  INTEGER,
  seasons           JSONB,
  customer_type     TEXT,
  featured          BOOLEAN,
  sort_order        INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.name, p.short_description, p.description, p.includes,
    p.also_includes, p.pricing, p.price_gbp, p.price_confirmed,
    p.duration_minutes, p.seasons, p.customer_type, p.featured, p.sort_order
  FROM public.service_packages p
  WHERE p.is_active
  ORDER BY p.sort_order, p.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_packages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_packages() TO anon, authenticated;
