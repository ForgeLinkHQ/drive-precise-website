-- The service catalogue (§42).
--
-- The shipped catalogue lives in src/lib/services.ts. This table overlays it so
-- prices, descriptions and availability can change without a deploy, which is
-- the explicit requirement: "Allow service prices to be changed without editing
-- code."
--
-- Precedence at runtime is: this table when it has rows, the code catalogue
-- otherwise. An empty table therefore means "migrations have run but nothing
-- has been published yet" and the site shows the shipped menu — which is a far
-- better failure than an empty price list.
--
-- Cost and margin columns live here too (§60) and are readable only by an
-- admin. There is no policy on this table that exposes them to anon, and the
-- public read policy names its columns explicitly rather than granting the
-- whole row, so adding a commercially sensitive column later cannot silently
-- publish it.

CREATE TABLE IF NOT EXISTS public.services (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  category                TEXT NOT NULL CHECK (category IN (
                            'servicing', 'brakes-suspension', 'repairs',
                            'checks', 'modifications', 'mobile', 'diagnostics'
                          )),
  short_description       TEXT NOT NULL DEFAULT '',
  description             TEXT NOT NULL DEFAULT '',
  includes                JSONB NOT NULL DEFAULT '[]'::jsonb,

  pricing                 TEXT NOT NULL CHECK (pricing IN ('fixed', 'from', 'quote')),
  price_gbp               NUMERIC(10, 2),
  price_suffix            TEXT,
  price_confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
  compare_price_gbp       NUMERIC(10, 2),

  duration_minutes        INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  mobile                  TEXT NOT NULL DEFAULT 'conditional'
                            CHECK (mobile IN ('yes', 'no', 'conditional')),
  workshop_recommended    BOOLEAN NOT NULL DEFAULT FALSE,
  collection_available    BOOLEAN NOT NULL DEFAULT TRUE,
  requires_parts_quote    BOOLEAN NOT NULL DEFAULT FALSE,

  add_ons                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  incompatible_with       JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggests_partner        JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasons                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  also_in                 JSONB NOT NULL DEFAULT '[]'::jsonb,

  customer_type           TEXT NOT NULL DEFAULT 'both'
                            CHECK (customer_type IN ('retail', 'trade', 'both')),
  mod_stream              TEXT CHECK (mod_stream IS NULL OR mod_stream IN ('fit', 'remove')),
  add_on_only             BOOLEAN NOT NULL DEFAULT FALSE,
  featured                BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order              INTEGER NOT NULL DEFAULT 0,

  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  inactive_reason         TEXT,

  -- Internal commercial data (§60). Never exposed to anon by any policy here.
  parts_cost_gbp          NUMERIC(10, 2),
  consumables_cost_gbp    NUMERIC(10, 2),
  labour_allocation_mins  INTEGER,
  travel_minutes          INTEGER,
  internal_notes          TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A fixed or from price without a number would render as "£0", which is a
  -- promise nobody can keep. The database refuses to hold that state at all.
  CONSTRAINT priced_types_have_a_price
    CHECK (pricing = 'quote' OR price_gbp IS NOT NULL),
  CONSTRAINT quote_type_has_no_price
    CHECK (pricing <> 'quote' OR price_gbp IS NULL)
);

CREATE INDEX IF NOT EXISTS services_category_idx ON public.services (category, sort_order);
CREATE INDEX IF NOT EXISTS services_active_idx ON public.services (is_active) WHERE is_active;

DROP TRIGGER IF EXISTS services_touch ON public.services;
CREATE TRIGGER services_touch BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.service_packages (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  includes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  also_includes     JSONB NOT NULL DEFAULT '[]'::jsonb,
  pricing           TEXT NOT NULL CHECK (pricing IN ('fixed', 'from', 'quote')),
  price_gbp         NUMERIC(10, 2),
  price_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
  duration_minutes  INTEGER,
  seasons           JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_type     TEXT NOT NULL DEFAULT 'retail'
                      CHECK (customer_type IN ('retail', 'trade', 'both')),
  featured          BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT package_priced_types_have_a_price
    CHECK (pricing = 'quote' OR price_gbp IS NOT NULL)
);

DROP TRIGGER IF EXISTS service_packages_touch ON public.service_packages;
CREATE TRIGGER service_packages_touch BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

-- Admins manage the catalogue.
CREATE POLICY "admin_manage_services" ON public.services
  FOR ALL TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

CREATE POLICY "admin_manage_packages" ON public.service_packages
  FOR ALL TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

-- The public read path is a SECURITY DEFINER function, not a SELECT policy.
--
-- This is the important security decision in the file, so it is worth being
-- explicit about why the obvious alternatives were rejected:
--
--   * A SELECT policy on `services` for anon would work at row level and do
--     nothing at column level. RLS filters rows; it cannot hide a column. A
--     browser issuing `select('*')` would have received parts_cost_gbp,
--     labour_allocation_mins and internal_notes for every active service —
--     precisely the data §60 says must never reach a customer.
--   * A `security_invoker` view has the same hole, because it still needs that
--     policy underneath it to return anything at all.
--   * Column-level GRANTs would fix anon but not `authenticated`, and this
--     site will have signed-in customers eventually.
--
-- A definer function is the only version where the column list is the contract.
-- No policy admits anon or a non-admin to the table itself, so the columns not
-- named below are unreachable by construction.

CREATE OR REPLACE FUNCTION public.get_public_services()
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
    s.pricing, s.price_gbp, s.price_suffix, s.compare_price_gbp,
    s.duration_minutes, s.mobile, s.workshop_recommended, s.collection_available,
    s.requires_parts_quote, s.add_ons, s.incompatible_with, s.suggests_partner,
    s.seasons, s.also_in, s.customer_type, s.mod_stream, s.add_on_only,
    s.featured, s.sort_order
  FROM public.services s
  WHERE s.is_active
    AND s.customer_type <> 'trade'
    -- §46: diagnostics stays off the public site until the equipment exists
    -- and its real capabilities have been reviewed.
    AND s.category <> 'diagnostics'
  ORDER BY s.category, s.sort_order, s.name;
$$;

CREATE OR REPLACE FUNCTION public.get_public_packages()
RETURNS TABLE (
  id                TEXT,
  name              TEXT,
  short_description TEXT,
  description       TEXT,
  includes          JSONB,
  also_includes     JSONB,
  pricing           TEXT,
  price_gbp         NUMERIC,
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
    p.also_includes, p.pricing, p.price_gbp, p.duration_minutes, p.seasons,
    p.customer_type, p.featured, p.sort_order
  FROM public.service_packages p
  WHERE p.is_active
  ORDER BY p.sort_order, p.name;
$$;

-- Nothing but the two functions above may read these tables without an admin
-- role. The revokes make that true even if Supabase's default grants change.
REVOKE ALL ON public.services FROM anon;
REVOKE ALL ON public.service_packages FROM anon;

REVOKE ALL ON FUNCTION public.get_public_services() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_packages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_services() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_packages() TO anon, authenticated;
