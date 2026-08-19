-- The diary, and the customer it belongs to.
--
-- ── Why these names ──────────────────────────────────────────────────────
--
-- `clients`, `tags`, `client_tags`, `business_hours`, `availability_overrides`,
-- `blackout_periods`, `booking_settings`, `bookings`. Not `customers`, not
-- `jobs`, not `job_slots`.
--
-- They are the names the Portal's module registry already uses, chosen when the
-- only client site was a beauty studio. A salon's appointment, a garage's job
-- and a restaurant's reservation are one action — commit a resource to a
-- customer for a period — and the registry is keyed on the action rather than
-- the noun. Naming this table `jobs` would mean the Portal's `diary` module
-- could not claim it, which would mean a second module that does the same
-- thing, which is how a platform ends up with one codebase per trade.
--
-- The garage's own vocabulary lives in the vertical's nav labels, where it
-- costs nothing. The word on the screen is what matters to the owner; the word
-- in the schema is what matters to whoever maintains both sites.
--
-- ── What genuinely differs, and is therefore in the schema ────────────────
--
-- Drive Precise is `scheduling: "travelling"`. The mechanic goes to the
-- vehicle, so a slot is an interval *and* a place, and two jobs that do not
-- overlap can still be impossible if the second cannot be reached from the
-- first. The beauty studio's booking engine already has the mechanism for this
-- and calls it something else: a `buffer_minutes` that keeps the chair blocked
-- after the appointment ends. Here that buffer is travel time, taken from the
-- catalogue's `travel_minutes`, and it feeds the same exclusion constraint.
--
-- That is an honest approximation rather than a routing solver. A fixed
-- allowance per service cannot know that today's two jobs are both in Fleet.
-- What it does guarantee is that the diary never sells a day that assumes
-- teleportation, which is the failure that actually costs money. Real routing
-- needs a distance matrix and belongs behind a provider, not in a check
-- constraint.
--
-- ── A job starts as an accepted quote ────────────────────────────────────
--
-- The public site takes an enquiry, never a booking: the price cannot be known
-- until a human has seen the car (`pricing: "variable"`). So `bookings.enquiry_id`
-- is how a job exists at all, and the enquiry's status flow — which already ran
-- `quoted → quote_accepted → booking_pending → booked → completed` before this
-- migration and had nothing behind it — is now backed by a row.
--
-- `service_name` and `agreed_price_gbp` are copied onto the booking rather than
-- joined. Two reasons, and the first is the one that matters: the enquiry's
-- `items` snapshot already establishes the rule that what was agreed must not
-- move when the catalogue does. The second is §60 — the Portal is refused the
-- `services` table because it carries parts cost, so a console page that needed
-- to join to it could not.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 1. CUSTOMERS
-- ============================================================
--
-- Keyed on phone rather than email, which is the opposite of the salon and is
-- not a preference. A garage customer gives a mobile number and often no email
-- at all; the enquiry form makes `customer_phone` required and `customer_email`
-- optional, and this table has to be able to represent whoever that form
-- accepts.
CREATE TABLE IF NOT EXISTS public.clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          TEXT,
  last_name           TEXT,
  email               TEXT,
  phone               TEXT NOT NULL,
  postcode            TEXT,
  address_line        TEXT,

  /* Retail unless somebody says otherwise; `trade` mirrors the catalogue's own
     customer_type, so a trade account and a trade price line up. */
  tier                TEXT NOT NULL DEFAULT 'retail'
                        CHECK (tier IN ('retail', 'trade', 'vip', 'lapsed')),
  is_favourite        BOOLEAN NOT NULL DEFAULT FALSE,

  marketing_consent   BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent_at TIMESTAMPTZ,

  notes               TEXT,
  /* Set when a customer is quoted a standing deposit different from the norm —
     a trade account on account terms, or somebody rebuilding trust after a
     no-show. Null means "use the setting". */
  deposit_override_gbp NUMERIC(10, 2),

  first_booked_at     TIMESTAMPTZ,
  last_booked_at      TIMESTAMPTZ,
  visits_count        INT NOT NULL DEFAULT 0,
  lifetime_spend_gbp  NUMERIC(12, 2) NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS clients_last_booked_idx ON public.clients (last_booked_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS clients_email_idx ON public.clients (email) WHERE email IS NOT NULL;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clients FROM anon;

DROP POLICY IF EXISTS "staff_read_clients" ON public.clients;
CREATE POLICY "staff_read_clients" ON public.clients
  FOR SELECT TO authenticated USING (public.has_staff_role());
DROP POLICY IF EXISTS "admin_manage_clients" ON public.clients;
CREATE POLICY "admin_manage_clients" ON public.clients
  FOR ALL TO authenticated
  USING (public.has_admin_role()) WITH CHECK (public.has_admin_role());

DROP TRIGGER IF EXISTS clients_touch ON public.clients;
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  colour     TEXT NOT NULL DEFAULT '#063298',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_tags (
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, tag_id)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tags FROM anon;
REVOKE ALL ON public.client_tags FROM anon;

DROP POLICY IF EXISTS "staff_manage_tags" ON public.tags;
CREATE POLICY "staff_manage_tags" ON public.tags
  FOR ALL TO authenticated
  USING (public.has_staff_role()) WITH CHECK (public.has_staff_role());
DROP POLICY IF EXISTS "staff_manage_client_tags" ON public.client_tags;
CREATE POLICY "staff_manage_client_tags" ON public.client_tags
  FOR ALL TO authenticated
  USING (public.has_staff_role()) WITH CHECK (public.has_staff_role());

-- The enquiry can now point at a customer. Nullable, and stays nullable: a
-- first enquiry arrives from somebody with no record, and inventing one before
-- there is a job would fill the table with people who never booked.
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS enquiries_client_idx ON public.enquiries (client_id);

-- ============================================================
-- 2. WHEN THE BUSINESS WORKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_settings (
  id                       SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone                 TEXT NOT NULL DEFAULT 'Europe/London',
  slot_granularity_minutes INT NOT NULL DEFAULT 30
                             CHECK (slot_granularity_minutes BETWEEN 5 AND 60),
  /* Longer than a salon's four hours. A mobile job needs parts ordered and a
     route planned, and offering tomorrow morning at 8pm tonight is a promise
     the van cannot keep. */
  min_notice_hours         INT NOT NULL DEFAULT 24 CHECK (min_notice_hours >= 0),
  max_advance_days         INT NOT NULL DEFAULT 90 CHECK (max_advance_days BETWEEN 1 AND 365),
  hold_minutes             INT NOT NULL DEFAULT 30 CHECK (hold_minutes BETWEEN 5 AND 120),
  /* What is taken to hold a date, when a deposit is taken at all. Zero means
     the job is booked on trust and invoiced on completion. */
  default_deposit_gbp      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (default_deposit_gbp >= 0),
  /* Fallback when a service has no travel_minutes of its own. */
  default_travel_minutes   INT NOT NULL DEFAULT 30 CHECK (default_travel_minutes >= 0),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.booking_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_settings FROM anon;
DROP POLICY IF EXISTS "staff_read_booking_settings" ON public.booking_settings;
CREATE POLICY "staff_read_booking_settings" ON public.booking_settings
  FOR SELECT TO authenticated USING (public.has_staff_role());
DROP POLICY IF EXISTS "admin_manage_booking_settings" ON public.booking_settings;
CREATE POLICY "admin_manage_booking_settings" ON public.booking_settings
  FOR ALL TO authenticated
  USING (public.has_admin_role()) WITH CHECK (public.has_admin_role());

DROP TRIGGER IF EXISTS booking_settings_touch ON public.booking_settings;
CREATE TRIGGER booking_settings_touch BEFORE UPDATE ON public.booking_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 0 = Sunday … 6 = Saturday, matching EXTRACT(dow).
CREATE TABLE IF NOT EXISTS public.business_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at    TIME NOT NULL,
  closes_at   TIME NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

-- Monday to Friday, 08:00–17:00, plus a Saturday morning. Editable from the
-- console; this is a starting point rather than a claim about the business.
INSERT INTO public.business_hours (day_of_week, opens_at, closes_at)
SELECT * FROM (VALUES
  (1::smallint, '08:00'::time, '17:00'::time),
  (2, '08:00', '17:00'),
  (3, '08:00', '17:00'),
  (4, '08:00', '17:00'),
  (5, '08:00', '17:00'),
  (6, '08:00', '13:00')
) AS seed(d, o, c)
WHERE NOT EXISTS (SELECT 1 FROM public.business_hours);

CREATE TABLE IF NOT EXISTS public.availability_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  override_date DATE NOT NULL,
  opens_at      TIME NOT NULL,
  closes_at     TIME NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at),
  UNIQUE (override_date, opens_at)
);
CREATE INDEX IF NOT EXISTS availability_overrides_date_idx
  ON public.availability_overrides (override_date);

CREATE TABLE IF NOT EXISTS public.blackout_periods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS blackout_periods_range_idx
  ON public.blackout_periods (starts_at, ends_at);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_hours', 'availability_overrides', 'blackout_periods'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "staff_read_%s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "staff_read_%s" ON public.%I FOR SELECT TO authenticated USING (public.has_staff_role())',
      t, t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_manage_%s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "admin_manage_%s" ON public.%I FOR ALL TO authenticated '
      'USING (public.has_admin_role()) WITH CHECK (public.has_admin_role())',
      t, t);
  END LOOP;
END
$$;

-- ============================================================
-- 3. THE DIARY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  /* Where the job came from. A booking without an enquiry is possible — the
     phone rings — but the ordinary path is an accepted quote. */
  enquiry_id        UUID REFERENCES public.enquiries (id) ON DELETE SET NULL,
  client_id         UUID REFERENCES public.clients (id) ON DELETE SET NULL,

  service_id        TEXT NOT NULL,
  /* Copied, not joined. What was agreed must not move when the catalogue does,
     and the Portal cannot read the services table at all (§60). */
  service_name      TEXT NOT NULL,
  agreed_price_gbp  NUMERIC(10, 2) NOT NULL CHECK (agreed_price_gbp >= 0),
  deposit_gbp       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (deposit_gbp >= 0),
  deposit_paid      BOOLEAN NOT NULL DEFAULT FALSE,

  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  /* ends_at plus the travel allowance. Snapshotted rather than computed so the
     exclusion constraint below is self-contained and a catalogue edit cannot
     retroactively make two existing jobs overlap. */
  blocked_until     TIMESTAMPTZ NOT NULL,
  travel_minutes    INT NOT NULL DEFAULT 0 CHECK (travel_minutes >= 0),

  /* Where the van is going. A slot here is a time and a place. */
  postcode          TEXT,
  service_location  TEXT CHECK (service_location IS NULL OR service_location IN
                      ('home', 'workplace', 'collection', 'workshop')),
  registration      TEXT,

  status            TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                      'pending_payment', 'confirmed', 'completed',
                      'cancelled', 'no_show'
                    )),
  /* Only meaningful while pending_payment: past it, the hold has lapsed and
     the slot is free for anyone. */
  hold_expires_at   TIMESTAMPTZ,
  source            TEXT NOT NULL DEFAULT 'portal'
                      CHECK (source IN ('portal', 'quote_accept', 'phone', 'admin')),

  notes             TEXT,
  cancelled_reason  TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,

  CONSTRAINT bookings_time_order
    CHECK (ends_at > starts_at AND blocked_until >= ends_at)
);

CREATE INDEX IF NOT EXISTS bookings_starts_at_idx ON public.bookings (starts_at);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.bookings (status, starts_at);
CREATE INDEX IF NOT EXISTS bookings_enquiry_idx ON public.bookings (enquiry_id);
CREATE INDEX IF NOT EXISTS bookings_live_holds_idx
  ON public.bookings (hold_expires_at) WHERE status = 'pending_payment';

-- The constraint that makes double-booking impossible rather than unlikely.
--
-- Application code can always be got around — a second tab, a retried request,
-- an admin doing something by hand. This cannot: two live rows whose blocked
-- ranges overlap simply do not both exist, and a race loses with SQLSTATE
-- 23P01, which reserve_slot() turns into a clean 'slot_taken'.
--
-- Because the range ends at `blocked_until` rather than `ends_at`, the travel
-- allowance is part of what is reserved. A ninety-minute job with a
-- thirty-minute allowance blocks two hours, which is what the day actually
-- costs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (tstzrange(starts_at, blocked_until, '[)') WITH &&)
      WHERE (status IN ('pending_payment', 'confirmed'));
  END IF;
END
$$;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bookings FROM anon;

DROP POLICY IF EXISTS "staff_read_bookings" ON public.bookings;
CREATE POLICY "staff_read_bookings" ON public.bookings
  FOR SELECT TO authenticated USING (public.has_staff_role());
DROP POLICY IF EXISTS "admin_manage_bookings" ON public.bookings;
CREATE POLICY "admin_manage_bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_admin_role()) WITH CHECK (public.has_admin_role());

DROP TRIGGER IF EXISTS bookings_touch ON public.bookings;
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

/**
 * Stamp the lifecycle timestamps from the status, so a report never has to
 * trust that somebody remembered to set a date. Mirrors what
 * `stamp_enquiry_status()` already does for enquiries.
 */
CREATE OR REPLACE FUNCTION public.stamp_booking_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' AND NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := now();
    END IF;
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_stamp ON public.bookings;
CREATE TRIGGER bookings_stamp BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_booking_status();

-- ============================================================
-- 4. WHETHER A SLOT CAN BE SOLD
-- ============================================================

/**
 * One reason a candidate start time will not work, or NULL if it will.
 *
 * Shared by the slot search and the atomic reservation, deliberately: two
 * copies of these rules would drift, and the copy that drifted would be the one
 * that lets a job be booked into a blackout.
 *
 * Returns a machine-readable token rather than a sentence. The console turns it
 * into English; a caller that wants to branch on it should not be parsing prose.
 */
CREATE OR REPLACE FUNCTION public.slot_unavailable_reason(
  _service_id TEXT,
  _starts_at  TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        public.booking_settings%ROWTYPE;
  svc      public.services%ROWTYPE;
  local_ts TIMESTAMP;
  duration INT;
  travel   INT;
  svc_end  TIMESTAMPTZ;
  van_end  TIMESTAMPTZ;
  has_override BOOLEAN;
BEGIN
  SELECT * INTO s FROM public.booking_settings WHERE id = 1;
  SELECT * INTO svc FROM public.services WHERE id = _service_id AND is_active;
  IF NOT FOUND THEN
    RETURN 'unknown_service';
  END IF;

  -- A service with no duration cannot be put in a diary. That is not a bug in
  -- the data: `quote` services genuinely have no known length until somebody
  -- has looked at the car, and pretending otherwise would sell a slot that
  -- cannot be honoured.
  duration := svc.duration_minutes;
  IF duration IS NULL OR duration <= 0 THEN
    RETURN 'no_duration';
  END IF;

  travel   := COALESCE(svc.travel_minutes, s.default_travel_minutes);
  local_ts := _starts_at AT TIME ZONE s.timezone;
  svc_end  := _starts_at + make_interval(mins => duration);
  van_end  := svc_end + make_interval(mins => travel);

  IF EXTRACT(second FROM local_ts) <> 0
     OR (EXTRACT(minute FROM local_ts)::int % s.slot_granularity_minutes) <> 0 THEN
    RETURN 'off_grid';
  END IF;

  IF _starts_at < now() + make_interval(hours => s.min_notice_hours) THEN
    RETURN 'too_soon';
  END IF;
  IF _starts_at > now() + make_interval(days => s.max_advance_days) THEN
    RETURN 'too_far_ahead';
  END IF;

  -- A date-specific override replaces the weekday's normal hours rather than
  -- adding to them, so a half-day genuinely is a half-day.
  SELECT EXISTS (
    SELECT 1 FROM public.availability_overrides ao
     WHERE ao.override_date = local_ts::date
  ) INTO has_override;

  IF has_override THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.availability_overrides ao
       WHERE ao.override_date = local_ts::date
         AND local_ts::time >= ao.opens_at
         AND (local_ts::time + make_interval(mins => duration)) <= ao.closes_at
    ) THEN
      RETURN 'outside_hours';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.business_hours bh
     WHERE bh.day_of_week = EXTRACT(dow FROM local_ts)::smallint
       AND local_ts::time >= bh.opens_at
       AND (local_ts::time + make_interval(mins => duration)) <= bh.closes_at
  ) THEN
    RETURN 'outside_hours';
  END IF;

  -- The work must finish inside the working day; the drive home may not.
  IF EXISTS (
    SELECT 1 FROM public.blackout_periods bp
     WHERE tstzrange(bp.starts_at, bp.ends_at, '[)') && tstzrange(_starts_at, van_end, '[)')
  ) THEN
    RETURN 'blackout';
  END IF;

  -- Live jobs: confirmed, or held and not yet lapsed. The comparison is against
  -- `blocked_until`, so an existing job's travel allowance protects the slot
  -- after it as well as the slot itself.
  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE (b.status = 'confirmed'
            OR (b.status = 'pending_payment' AND b.hold_expires_at > now()))
       AND tstzrange(b.starts_at, b.blocked_until, '[)') && tstzrange(_starts_at, van_end, '[)')
  ) THEN
    RETURN 'taken';
  END IF;

  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.slot_unavailable_reason(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.slot_unavailable_reason(TEXT, TIMESTAMPTZ)
  TO authenticated, service_role;

/**
 * Every start time that works for a service on one local calendar day.
 *
 * Candidates are generated in local wall-clock time and then anchored to UTC,
 * which is what makes the day of a clock change behave: 01:30 exists twice in
 * October and not at all in March, and generating in UTC would either offer a
 * slot that does not exist or hide one that does.
 */
CREATE OR REPLACE FUNCTION public.get_available_slots(
  _service_id TEXT,
  _day        DATE
) RETURNS TABLE (slot_starts_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s           public.booking_settings%ROWTYPE;
  svc         public.services%ROWTYPE;
  today_local DATE;
  duration    INT;
BEGIN
  SELECT * INTO s FROM public.booking_settings WHERE id = 1;
  SELECT * INTO svc FROM public.services WHERE id = _service_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_service' USING ERRCODE = 'P0001';
  END IF;

  duration := svc.duration_minutes;
  IF duration IS NULL OR duration <= 0 THEN
    RETURN;
  END IF;

  today_local := (now() AT TIME ZONE s.timezone)::date;
  IF _day < today_local OR _day > today_local + s.max_advance_days THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH windows AS (
    -- An override replaces the weekday's hours for that date.
    SELECT ao.opens_at, ao.closes_at
      FROM public.availability_overrides ao
     WHERE ao.override_date = _day
    UNION ALL
    SELECT bh.opens_at, bh.closes_at
      FROM public.business_hours bh
     WHERE bh.day_of_week = EXTRACT(dow FROM _day)::smallint
       AND NOT EXISTS (
         SELECT 1 FROM public.availability_overrides ao2 WHERE ao2.override_date = _day
       )
  )
  SELECT c.cand_utc
    FROM windows w
    CROSS JOIN LATERAL generate_series(
           (_day + w.opens_at)::timestamp,
           (_day + w.closes_at)::timestamp - make_interval(mins => duration),
           make_interval(mins => s.slot_granularity_minutes)
         ) AS g(local_ts)
    CROSS JOIN LATERAL (SELECT g.local_ts AT TIME ZONE s.timezone) AS c(cand_utc)
   WHERE public.slot_unavailable_reason(_service_id, c.cand_utc) IS NULL
   ORDER BY c.cand_utc;
END $$;

REVOKE ALL ON FUNCTION public.get_available_slots(TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(TEXT, DATE)
  TO authenticated, service_role;

/**
 * Take a slot, atomically.
 *
 * Everything below happens in one statement's worth of transaction: stale holds
 * in the window are released, the customer record is found or created, and the
 * booking is inserted. The exclusion constraint is the final arbiter — two
 * callers racing for the same slot both pass `slot_unavailable_reason`, and one
 * of them loses at INSERT with SQLSTATE 23P01 rather than both being told yes.
 *
 * Returns the booking as JSONB rather than a row type, so adding a field later
 * does not break every caller.
 */
CREATE OR REPLACE FUNCTION public.reserve_slot(
  _service_id       TEXT,
  _starts_at        TIMESTAMPTZ,
  _phone            TEXT,
  _first_name       TEXT DEFAULT NULL,
  _last_name        TEXT DEFAULT NULL,
  _email            TEXT DEFAULT NULL,
  _postcode         TEXT DEFAULT NULL,
  _enquiry_id       UUID DEFAULT NULL,
  _agreed_price_gbp NUMERIC DEFAULT NULL,
  _service_location TEXT DEFAULT NULL,
  _registration     TEXT DEFAULT NULL,
  _source           TEXT DEFAULT 'portal'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s          public.booking_settings%ROWTYPE;
  svc        public.services%ROWTYPE;
  reason     TEXT;
  v_client   UUID;
  duration   INT;
  travel     INT;
  v_price    NUMERIC;
  v_deposit  NUMERIC;
  v_booking  public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.booking_settings WHERE id = 1;

  -- Release anything whose hold has lapsed before judging the slot, so a
  -- customer who abandoned a checkout twenty minutes ago is not still holding
  -- the only Tuesday morning left.
  PERFORM public.cancel_expired_holds();

  reason := public.slot_unavailable_reason(_service_id, _starts_at);
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION '%', reason USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO svc FROM public.services WHERE id = _service_id;
  duration := svc.duration_minutes;
  travel   := COALESCE(svc.travel_minutes, s.default_travel_minutes);

  -- The agreed price wins over the catalogue's, always. A quote is what a human
  -- said the job costs once they had seen the car, and the catalogue number is
  -- indicative by design (§20).
  v_price := COALESCE(_agreed_price_gbp, svc.price_gbp);
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'price_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.clients (phone, first_name, last_name, email, postcode)
  VALUES (_phone, _first_name, _last_name, _email, _postcode)
  ON CONFLICT (phone) DO UPDATE
    SET first_name = COALESCE(EXCLUDED.first_name, public.clients.first_name),
        last_name  = COALESCE(EXCLUDED.last_name,  public.clients.last_name),
        email      = COALESCE(EXCLUDED.email,      public.clients.email),
        postcode   = COALESCE(EXCLUDED.postcode,   public.clients.postcode)
  RETURNING id INTO v_client;

  v_deposit := COALESCE(
    (SELECT deposit_override_gbp FROM public.clients WHERE id = v_client),
    s.default_deposit_gbp
  );

  BEGIN
    INSERT INTO public.bookings (
      enquiry_id, client_id, service_id, service_name, agreed_price_gbp,
      deposit_gbp, starts_at, ends_at, blocked_until, travel_minutes,
      postcode, service_location, registration, status, hold_expires_at, source
    ) VALUES (
      _enquiry_id, v_client, _service_id, svc.name, v_price,
      v_deposit,
      _starts_at,
      _starts_at + make_interval(mins => duration),
      _starts_at + make_interval(mins => duration + travel),
      travel,
      COALESCE(_postcode, (SELECT postcode FROM public.clients WHERE id = v_client)),
      _service_location, _registration,
      -- Nothing to pay means nothing to wait for.
      CASE WHEN v_deposit > 0 THEN 'pending_payment' ELSE 'confirmed' END,
      CASE WHEN v_deposit > 0
           THEN now() + make_interval(mins => s.hold_minutes) END,
      _source
    )
    RETURNING * INTO v_booking;
  EXCEPTION WHEN exclusion_violation THEN
    -- Somebody else got there between the check and the insert.
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
  END;

  IF _enquiry_id IS NOT NULL THEN
    UPDATE public.enquiries
       SET client_id = COALESCE(client_id, v_client),
           status = CASE
                      WHEN v_booking.status = 'confirmed' THEN 'booked'
                      ELSE 'booking_pending'
                    END
     WHERE id = _enquiry_id;
  END IF;

  RETURN to_jsonb(v_booking);
END $$;

REVOKE ALL ON FUNCTION public.reserve_slot(
  TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, NUMERIC, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_slot(
  TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, NUMERIC, TEXT, TEXT, TEXT)
  TO authenticated, service_role;

/**
 * Release holds nobody completed.
 *
 * Called at the top of `reserve_slot` so the diary is self-healing without a
 * scheduler, and available to pg_cron for the case where nobody books for a
 * week and yesterday's abandoned hold is still sitting there.
 */
CREATE OR REPLACE FUNCTION public.cancel_expired_holds()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled',
         cancelled_reason = 'Payment not completed in time'
   WHERE status = 'pending_payment'
     AND hold_expires_at IS NOT NULL
     AND hold_expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.cancel_expired_holds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_expired_holds() TO authenticated, service_role;

/**
 * Move a booking along its status flow.
 *
 * The only supported way, for the same reason `update_enquiry_status()` is the
 * only way to move an enquiry: the refusals below are the point. A cancellation
 * with no reason produces a row nobody can learn anything from, and a booking
 * completed without ever being confirmed means the diary and the money have
 * disagreed somewhere upstream.
 */
CREATE OR REPLACE FUNCTION public.record_booking_status_change(
  p_booking_id UUID,
  p_status     TEXT,
  p_reason     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_booking' USING ERRCODE = 'P0001';
  END IF;

  IF p_status IN ('cancelled', 'no_show')
     AND COALESCE(p_reason, v.cancelled_reason) IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_status = 'completed' AND v.status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'not_confirmed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bookings
     SET status = p_status,
         cancelled_reason = COALESCE(p_reason, cancelled_reason)
   WHERE id = p_booking_id
  RETURNING * INTO v;

  -- Completing a job is what makes somebody a returning customer, so the
  -- counters move here and nowhere else.
  IF p_status = 'completed' AND v.client_id IS NOT NULL THEN
    UPDATE public.clients
       SET visits_count       = visits_count + 1,
           lifetime_spend_gbp = lifetime_spend_gbp + v.agreed_price_gbp,
           first_booked_at    = COALESCE(first_booked_at, v.starts_at),
           last_booked_at     = GREATEST(COALESCE(last_booked_at, v.starts_at), v.starts_at)
     WHERE id = v.client_id;
  END IF;

  IF v.enquiry_id IS NOT NULL AND p_status = 'completed' THEN
    UPDATE public.enquiries SET status = 'completed' WHERE id = v.enquiry_id;
  END IF;

  RETURN to_jsonb(v);
END $$;

REVOKE ALL ON FUNCTION public.record_booking_status_change(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_booking_status_change(UUID, TEXT, TEXT)
  TO authenticated, service_role;
