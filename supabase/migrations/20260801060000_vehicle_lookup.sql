-- Vehicle lookup (§21).
--
-- The brief's rule is one sentence: "Never fabricate vehicle details." Until
-- now the site honoured it by knowing nothing — `describeVehicle()` returned
-- "Model to confirm" and the vehicle_* columns on `enquiries` sat empty,
-- waiting for a provider. This adds the provider.
--
-- The source is the DVLA Vehicle Enquiry Service, which is the official
-- register: free, authoritative, and the same data the tax and MOT checkers
-- read. What it returns is make, colour, fuel, engine capacity, year, and tax
-- and MOT status. What it does NOT return is the model. There is no "320d" in
-- a VES response, and there is no way to derive one from engine capacity
-- without guessing, which is exactly what §21 forbids. The model column stays
-- null unless a provider that actually carries it fills it in.
--
-- Three things live here rather than in the edge function:
--
--   1. The cache. A registration's make and year do not change, so looking the
--      same plate up twice is a wasted call against a rate-limited government
--      API. The cache also means a customer who returns to a half-built quote
--      sees their vehicle immediately.
--   2. The rate limit. A public lookup endpoint is an enumeration target, and
--      DVLA's quota is Drive Precise's to protect.
--   3. The read path, as a SECURITY DEFINER function, for the same reason
--      every other read here is: the table itself is never exposed.

-- ── The cache ─────────────────────────────────────────────────────────────
--
-- A registration is personal data under UK GDPR, so this holds the minimum
-- that makes the feature work and nothing else. No raw provider payload, no
-- keeper details (VES does not return them and we would not store them if it
-- did), and a retention window enforced by `purge_stale_vehicle_lookups()`.
CREATE TABLE IF NOT EXISTS public.vehicle_lookups (
  registration          TEXT PRIMARY KEY,

  -- Everything below is what the provider said. Never inferred, never
  -- defaulted to a plausible-looking value.
  make                  TEXT,
  -- Null from DVLA VES, which does not carry it. Present only if a provider
  -- that does is configured, or a human fills it in.
  model                 TEXT,
  colour                TEXT,
  fuel_type             TEXT,
  engine_capacity_cc    INTEGER CHECK (engine_capacity_cc IS NULL
                          OR (engine_capacity_cc > 0 AND engine_capacity_cc < 20000)),
  year_of_manufacture   INTEGER CHECK (year_of_manufacture IS NULL
                          OR (year_of_manufacture > 1900 AND year_of_manufacture < 2100)),
  month_of_first_reg    TEXT,
  co2_emissions         INTEGER,
  euro_status           TEXT,
  wheelplan             TEXT,
  type_approval         TEXT,

  -- Public status data. Useful and honest: "your MOT runs out in three weeks"
  -- is a real reason to book, and it comes from the register rather than from
  -- us guessing.
  tax_status            TEXT,
  tax_due_date          DATE,
  mot_status            TEXT,
  mot_expiry_date       DATE,
  marked_for_export     BOOLEAN,
  date_of_last_v5c      DATE,

  -- Which provider answered, so a wrong record can be traced to its source.
  source                TEXT NOT NULL CHECK (source IN ('dvla-ves', 'manual')),
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vehicle_lookups IS
  'Cached DVLA Vehicle Enquiry Service results. Personal data: purge on the retention schedule.';
COMMENT ON COLUMN public.vehicle_lookups.model IS
  'Null from DVLA VES, which does not return a model. Never inferred from engine capacity (§21).';

CREATE INDEX IF NOT EXISTS vehicle_lookups_fetched_at_idx
  ON public.vehicle_lookups (fetched_at);

ALTER TABLE public.vehicle_lookups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_lookups FROM anon;

-- Staff can see what was looked up; nobody else touches the table directly.
CREATE POLICY "staff_read_vehicle_lookups" ON public.vehicle_lookups
  FOR SELECT TO authenticated
  USING (public.has_staff_role());

-- ── Rate limiting ─────────────────────────────────────────────────────────
--
-- Keyed by a hash of the caller's IP, never the IP itself: this table exists
-- to stop abuse, not to build a log of who looked up what. The registration
-- is deliberately absent for the same reason.
CREATE TABLE IF NOT EXISTS public.vehicle_lookup_requests (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_hash   TEXT NOT NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_lookup_requests_client_idx
  ON public.vehicle_lookup_requests (client_hash, requested_at DESC);

ALTER TABLE public.vehicle_lookup_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_lookup_requests FROM anon;

/**
 * Record an attempt and say whether it is within the allowance.
 *
 * Ten lookups a minute is far above what building one quote needs and far
 * below what enumerating the register would need.
 */
CREATE OR REPLACE FUNCTION public.check_vehicle_lookup_rate(
  _client_hash TEXT,
  _limit       INTEGER DEFAULT 10,
  _window      INTERVAL DEFAULT INTERVAL '1 minute'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent INTEGER;
BEGIN
  IF _client_hash IS NULL OR btrim(_client_hash) = '' THEN
    RETURN FALSE;
  END IF;

  SELECT count(*) INTO recent
  FROM public.vehicle_lookup_requests
  WHERE client_hash = _client_hash
    AND requested_at > now() - _window;

  IF recent >= _limit THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.vehicle_lookup_requests (client_hash) VALUES (_client_hash);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_vehicle_lookup_rate(TEXT, INTEGER, INTERVAL) FROM PUBLIC;

-- ── Retention ─────────────────────────────────────────────────────────────
--
-- Registrations are personal data, so the cache is not permanent. Ninety days
-- keeps it useful across a customer's quote-and-book cycle without becoming a
-- standing database of who drives what. Run from a scheduled job.
CREATE OR REPLACE FUNCTION public.purge_stale_vehicle_lookups(
  _older_than INTERVAL DEFAULT INTERVAL '90 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.vehicle_lookups WHERE fetched_at < now() - _older_than;
  GET DIAGNOSTICS removed = ROW_COUNT;

  DELETE FROM public.vehicle_lookup_requests WHERE requested_at < now() - INTERVAL '1 day';
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_stale_vehicle_lookups(INTERVAL) FROM PUBLIC;

-- ── Carrying the details onto the enquiry ─────────────────────────────────
--
-- The vehicle_* columns on `enquiries` have been sitting empty since the
-- schema was written, described as "populated by a lookup provider or by hand
-- later (§21)". This is that provider, so create_enquiry gains the parameters
-- to record what was found.
--
-- Dropped and recreated rather than CREATE OR REPLACE: adding parameters
-- changes the signature, which would otherwise leave a second overload behind
-- and make which one PostgREST calls a coin toss.
DROP FUNCTION IF EXISTS public.create_enquiry(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, NUMERIC, BOOLEAN, INTEGER,
  TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.create_enquiry(
  _customer_name        TEXT,
  _customer_phone       TEXT,
  _customer_email       TEXT,
  _registration         TEXT,
  _mileage              INTEGER,
  _vehicle_notes        TEXT,
  _items                JSONB,
  _indicative_total_gbp NUMERIC,
  _has_from_pricing     BOOLEAN,
  _quote_only_count     INTEGER,
  _postcode             TEXT,
  _service_location     TEXT,
  _preferred_date       DATE,
  _preferred_window     TEXT,
  _customer_notes       TEXT,
  _referral_source      TEXT,
  _campaign             TEXT,
  -- New, all optional so an unconfigured lookup changes nothing.
  _vehicle_make         TEXT DEFAULT NULL,
  _vehicle_model        TEXT DEFAULT NULL,
  _vehicle_variant      TEXT DEFAULT NULL,
  _vehicle_year         INTEGER DEFAULT NULL,
  _vehicle_fuel         TEXT DEFAULT NULL,
  _vehicle_engine       TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_reference TEXT;
  recent_count  INTEGER;
BEGIN
  IF _customer_name IS NULL OR btrim(_customer_name) = '' OR length(_customer_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF _customer_phone IS NULL OR length(regexp_replace(_customer_phone, '\D', '', 'g')) < 7
     OR length(_customer_phone) > 32 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF _registration IS NULL OR btrim(_registration) = '' OR length(_registration) > 16 THEN
    RAISE EXCEPTION 'invalid_registration';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 40 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;
  IF _customer_notes IS NOT NULL AND length(_customer_notes) > 4000 THEN
    RAISE EXCEPTION 'notes_too_long';
  END IF;

  -- Same flood guard as before: a burst from one registration is a script.
  SELECT count(*) INTO recent_count
  FROM public.enquiries
  WHERE registration = btrim(upper(_registration))
    AND created_at > now() - INTERVAL '1 minute';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'too_many_requests';
  END IF;

  INSERT INTO public.enquiries (
    customer_name, customer_phone, customer_email,
    registration, mileage, vehicle_notes,
    vehicle_make, vehicle_model, vehicle_variant,
    vehicle_year, vehicle_fuel, vehicle_engine,
    items, indicative_total_gbp, has_from_pricing, quote_only_count,
    postcode, service_location, preferred_date, preferred_window,
    customer_notes, referral_source, campaign
  ) VALUES (
    btrim(_customer_name), btrim(_customer_phone),
    NULLIF(btrim(lower(coalesce(_customer_email, ''))), ''),
    btrim(upper(_registration)), _mileage,
    NULLIF(btrim(coalesce(_vehicle_notes, '')), ''),
    NULLIF(btrim(coalesce(_vehicle_make, '')), ''),
    NULLIF(btrim(coalesce(_vehicle_model, '')), ''),
    NULLIF(btrim(coalesce(_vehicle_variant, '')), ''),
    _vehicle_year,
    NULLIF(btrim(coalesce(_vehicle_fuel, '')), ''),
    NULLIF(btrim(coalesce(_vehicle_engine, '')), ''),
    _items, coalesce(_indicative_total_gbp, 0), coalesce(_has_from_pricing, FALSE),
    coalesce(_quote_only_count, 0),
    NULLIF(btrim(upper(coalesce(_postcode, ''))), ''), _service_location, _preferred_date,
    _preferred_window, NULLIF(btrim(coalesce(_customer_notes, '')), ''),
    _referral_source, _campaign
  )
  RETURNING reference INTO new_reference;

  RETURN new_reference;
END;
$$;

REVOKE ALL ON FUNCTION public.create_enquiry(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, NUMERIC, BOOLEAN, INTEGER,
  TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_enquiry(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, NUMERIC, BOOLEAN, INTEGER,
  TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT
) TO anon, authenticated;
