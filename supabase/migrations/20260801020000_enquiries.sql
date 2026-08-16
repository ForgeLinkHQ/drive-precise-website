-- Enquiries (§27), trade enquiries (§33) and general contact messages.
--
-- The enquiry is the deliverable of the entire front end, so this table is
-- shaped around what §28 needs downstream: everything required to create a
-- customer, a vehicle and an estimate in TechMan, in one record, copyable in
-- one go while the integration is manual.

CREATE SEQUENCE IF NOT EXISTS public.enquiry_reference_seq START WITH 1000;

-- DP-1042. Human-quotable over the phone and on WhatsApp, which is the whole
-- job of a reference here — it has to survive being read aloud.
CREATE OR REPLACE FUNCTION public.next_enquiry_reference()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'DP-' || LPAD(nextval('public.enquiry_reference_seq')::TEXT, 4, '0');
$$;

CREATE TABLE IF NOT EXISTS public.enquiries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             TEXT NOT NULL UNIQUE DEFAULT public.next_enquiry_reference(),

  customer_name         TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,
  customer_email        TEXT,

  registration          TEXT NOT NULL,
  mileage               INTEGER CHECK (mileage IS NULL OR (mileage > 0 AND mileage < 1000000)),
  vehicle_notes         TEXT,
  -- Populated by a lookup provider or by hand later (§21). Never invented.
  vehicle_make          TEXT,
  vehicle_model         TEXT,
  vehicle_variant       TEXT,
  vehicle_year          INTEGER,
  vehicle_fuel          TEXT,
  vehicle_engine        TEXT,

  -- The basket exactly as the customer saw it, frozen at submit. Not a
  -- reference to the catalogue: the catalogue moves, and this must not.
  items                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  indicative_total_gbp  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  has_from_pricing      BOOLEAN NOT NULL DEFAULT FALSE,
  quote_only_count      INTEGER NOT NULL DEFAULT 0,

  postcode              TEXT,
  service_location      TEXT CHECK (service_location IS NULL OR service_location IN
                          ('home', 'workplace', 'collection', 'unsure')),
  preferred_date        DATE,
  preferred_window      TEXT CHECK (preferred_window IS NULL OR preferred_window IN
                          ('morning', 'afternoon', 'flexible')),

  customer_notes        TEXT,
  referral_source       TEXT,
  campaign              TEXT,

  status                TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                          'new', 'contacted', 'awaiting_information', 'quoted',
                          'quote_accepted', 'booking_pending', 'booked', 'lost',
                          'completed'
                        )),
  -- What Drive Precise actually quoted, once the vehicle is known. Separate
  -- from indicative_total_gbp so the gap between the two is measurable — that
  -- gap is how §41's "average initial basket vs average final basket" is
  -- answered.
  quoted_total_gbp      NUMERIC(10, 2),
  lost_reason           TEXT,
  admin_notes           TEXT,
  -- Manual TechMan handoff (§28). A text field, because there is no supported
  -- API to reference and inventing an integration would be worse than a
  -- copy-paste that works.
  techman_reference     TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_at          TIMESTAMPTZ,
  quoted_at             TIMESTAMPTZ,
  booked_at             TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS enquiries_status_idx ON public.enquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_registration_idx ON public.enquiries (registration);
CREATE INDEX IF NOT EXISTS enquiries_phone_idx ON public.enquiries (customer_phone);
CREATE INDEX IF NOT EXISTS enquiries_created_idx ON public.enquiries (created_at DESC);

DROP TRIGGER IF EXISTS enquiries_touch ON public.enquiries;
CREATE TRIGGER enquiries_touch BEFORE UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Stamp the lifecycle timestamps from the status, so the funnel timings in §41
-- are derivable without anyone remembering to set a date by hand.
CREATE OR REPLACE FUNCTION public.stamp_enquiry_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'contacted' AND NEW.contacted_at IS NULL THEN
      NEW.contacted_at := now();
    ELSIF NEW.status = 'quoted' AND NEW.quoted_at IS NULL THEN
      NEW.quoted_at := now();
    ELSIF NEW.status = 'booked' AND NEW.booked_at IS NULL THEN
      NEW.booked_at := now();
    ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enquiries_stamp_status ON public.enquiries;
CREATE TRIGGER enquiries_stamp_status BEFORE UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.stamp_enquiry_status();

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

-- Staff read, admins write. There is deliberately no anon policy of any kind:
-- an enquiry contains a name, a phone number and a vehicle registration, and
-- the write path below is a definer function precisely so that inserting one
-- never requires granting anon the ability to read one back.
CREATE POLICY "staff_read_enquiries" ON public.enquiries
  FOR SELECT TO authenticated
  USING (public.has_staff_role());

CREATE POLICY "admin_update_enquiries" ON public.enquiries
  FOR UPDATE TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

REVOKE ALL ON public.enquiries FROM anon;

-- The public write path.
--
-- A definer function rather than an INSERT policy, because PostgREST's
-- `.insert().select()` issues INSERT ... RETURNING, and RETURNING requires a
-- SELECT policy on the table. Granting anon SELECT to hand back one reference
-- number would have exposed every enquiry in the table to anyone with the
-- publishable key. This returns the reference and nothing else.
--
-- On trusting the client's prices: it stores what the customer was shown, and
-- that is the correct record for a *quote request*. No money changes hands
-- here and Drive Precise confirms the real figure before anything is booked
-- (§20), so re-pricing server-side would add complexity without protecting
-- anything. The caps below exist to stop the endpoint being used as free
-- storage, not to police prices.
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
  _campaign             TEXT
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

  -- Crude flood protection. Someone submitting six enquiries from one number
  -- inside five minutes is not a customer with six cars, and a legitimate
  -- sixth can be sent on WhatsApp — which the front end offers anyway when
  -- this fails.
  SELECT count(*) INTO recent_count
  FROM public.enquiries
  WHERE customer_phone = _customer_phone
    AND created_at > now() - INTERVAL '5 minutes';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'too_many_requests';
  END IF;

  INSERT INTO public.enquiries (
    customer_name, customer_phone, customer_email,
    registration, mileage, vehicle_notes,
    items, indicative_total_gbp, has_from_pricing, quote_only_count,
    postcode, service_location, preferred_date, preferred_window,
    customer_notes, referral_source, campaign
  ) VALUES (
    btrim(_customer_name), btrim(_customer_phone), NULLIF(btrim(coalesce(_customer_email, '')), ''),
    upper(regexp_replace(_registration, '[^A-Za-z0-9]', '', 'g')), _mileage, _vehicle_notes,
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
  TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

-- Trade enquiries (§33). Separate table: a different form, a different
-- lifecycle, and negotiated rates that must never sit alongside retail records.
CREATE TABLE IF NOT EXISTS public.trade_enquiries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          TEXT NOT NULL UNIQUE DEFAULT public.next_enquiry_reference(),
  business_name      TEXT NOT NULL,
  contact_name       TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT NOT NULL,
  business_postcode  TEXT,
  website            TEXT,
  operation_type     TEXT,
  vehicles_per_month TEXT,
  services_required  JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_ramp           BOOLEAN,
  typical_stock      TEXT,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                       'new', 'contacted', 'in_discussion', 'active', 'declined', 'lost'
                     )),
  admin_notes        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trade_enquiries_touch ON public.trade_enquiries;
CREATE TRIGGER trade_enquiries_touch BEFORE UPDATE ON public.trade_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.trade_enquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trade_enquiries FROM anon;

CREATE POLICY "staff_read_trade_enquiries" ON public.trade_enquiries
  FOR SELECT TO authenticated
  USING (public.has_staff_role());

CREATE POLICY "admin_update_trade_enquiries" ON public.trade_enquiries
  FOR UPDATE TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

CREATE OR REPLACE FUNCTION public.create_trade_enquiry(
  _business_name      TEXT,
  _contact_name       TEXT,
  _email              TEXT,
  _phone              TEXT,
  _business_postcode  TEXT,
  _website            TEXT,
  _operation_type     TEXT,
  _vehicles_per_month TEXT,
  _services_required  JSONB,
  _has_ramp           BOOLEAN,
  _typical_stock      TEXT,
  _notes              TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_reference TEXT;
BEGIN
  IF _business_name IS NULL OR btrim(_business_name) = '' OR length(_business_name) > 160 THEN
    RAISE EXCEPTION 'invalid_business_name';
  END IF;
  IF _contact_name IS NULL OR btrim(_contact_name) = '' OR length(_contact_name) > 120 THEN
    RAISE EXCEPTION 'invalid_contact_name';
  END IF;
  IF _email IS NULL OR _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(_email) > 254 THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF _phone IS NULL OR length(regexp_replace(_phone, '\D', '', 'g')) < 7 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF _notes IS NOT NULL AND length(_notes) > 4000 THEN
    RAISE EXCEPTION 'notes_too_long';
  END IF;

  INSERT INTO public.trade_enquiries (
    business_name, contact_name, email, phone, business_postcode, website,
    operation_type, vehicles_per_month, services_required, has_ramp,
    typical_stock, notes
  ) VALUES (
    btrim(_business_name), btrim(_contact_name), lower(btrim(_email)), btrim(_phone),
    NULLIF(btrim(upper(coalesce(_business_postcode, ''))), ''),
    NULLIF(btrim(coalesce(_website, '')), ''),
    _operation_type, _vehicles_per_month,
    coalesce(_services_required, '[]'::jsonb), _has_ramp,
    NULLIF(btrim(coalesce(_typical_stock, '')), ''),
    NULLIF(btrim(coalesce(_notes, '')), '')
  )
  RETURNING reference INTO new_reference;

  RETURN new_reference;
END;
$$;

REVOKE ALL ON FUNCTION public.create_trade_enquiry(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_enquiry(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, NUMERIC, BOOLEAN, INTEGER,
  TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_trade_enquiry(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT, TEXT
) TO anon, authenticated;
