-- Talking to the customer: confirmations, reminders, MOT recall, and reviews.
--
-- ── The recall is three lines of SQL, and it is the most valuable thing here ──
--
-- `recallBasis: "mandated"` has been on the automotive vertical since it was
-- written, and it means something specific: unlike a salon's "you're due a
-- trim", an MOT is a legal deadline the customer has whether or not anybody is
-- selling to them. Reminding someone their MOT runs out in three weeks is a
-- service first and marketing second, which is why it converts unlike any other
-- message a garage sends.
--
-- All of the data has been sitting here unused. The DVLA lookup already stores
-- `mot_expiry_date` and `tax_due_date` on `vehicle_lookups`, keyed by the same
-- registration the enquiry carries. Nothing has ever read either column.
--
-- And the machinery already exists too. `dispatch_owner_alerts()` is a
-- queue-then-sweep dispatcher: a trigger or a cron job writes a row, a sweep
-- posts it to an edge function, and nothing customer-facing ever depends on an
-- email provider being reachable at the moment it happens. The beauty studio
-- has the identical shape under a different name — `bookings_due_reminder()`
-- feeding `dispatch_booking_emails()`.
--
-- So the recall is not new machinery. It is one new "due" query pointed at the
-- same dispatcher:
--
--     hers   bookings_due_reminder()  → "your appointment is tomorrow"
--     this   vehicles_due_mot()       → "your MOT expires in three weeks"
--
-- ── Why a separate queue from the owner alerts ────────────────────────────
--
-- `owner_alert_queue` goes to one address that belongs to the business.
-- Everything here goes to a customer, which means consent, unsubscribes, a
-- record of what was sent to whom, and a much stronger reason never to send the
-- same thing twice. Different audience, different rules, different table.

-- ============================================================
-- 1. THE OUTBOX
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_emails (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN (
                 'booking_confirmation', 'booking_reminder', 'quote_sent',
                 'review_invite', 'mot_recall', 'service_recall'
               )),

  booking_id   UUID REFERENCES public.bookings (id) ON DELETE CASCADE,
  enquiry_id   UUID REFERENCES public.enquiries (id) ON DELETE CASCADE,
  client_id    UUID REFERENCES public.clients (id) ON DELETE CASCADE,

  to_email     TEXT,
  to_phone     TEXT,
  /* Everything the template needs, frozen at queue time. The catalogue and the
     diary both move; what was said to a customer must not. */
  detail       JSONB NOT NULL DEFAULT '{}',

  /* The natural key that stops a sweep sending the same thing twice. For an MOT
     recall it is the registration and the expiry it is about, so re-running the
     sweep every night is safe and a *new* expiry date produces a new message. */
  dedupe_key   TEXT NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_after   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ,
  error        TEXT,

  UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS booking_emails_pending_idx
  ON public.booking_emails (send_after) WHERE sent_at IS NULL;

ALTER TABLE public.booking_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_emails FROM anon;
GRANT ALL ON public.booking_emails TO service_role;
DROP POLICY IF EXISTS "staff_read_booking_emails" ON public.booking_emails;
CREATE POLICY "staff_read_booking_emails" ON public.booking_emails
  FOR SELECT TO authenticated USING (public.has_staff_role());

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  booking_id  UUID REFERENCES public.bookings (id) ON DELETE SET NULL,
  to_phone    TEXT NOT NULL,
  body        TEXT NOT NULL,
  direction   TEXT NOT NULL DEFAULT 'outbound'
                CHECK (direction IN ('outbound', 'inbound')),
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  provider_id TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sms_messages_client_idx ON public.sms_messages (client_id, created_at DESC);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_messages FROM anon;
GRANT ALL ON public.sms_messages TO service_role;
DROP POLICY IF EXISTS "staff_read_sms" ON public.sms_messages;
CREATE POLICY "staff_read_sms" ON public.sms_messages
  FOR SELECT TO authenticated USING (public.has_staff_role());

/**
 * Put a message in the outbox, unless an identical one is already there.
 *
 * `ON CONFLICT DO NOTHING` on the dedupe key is what makes every sweep below
 * safe to run as often as anyone likes. Running the MOT recall hourly instead
 * of nightly sends nothing extra.
 */
CREATE OR REPLACE FUNCTION public.enqueue_customer_message(
  p_kind       TEXT,
  p_dedupe_key TEXT,
  p_detail     JSONB DEFAULT '{}',
  p_to_email   TEXT DEFAULT NULL,
  p_to_phone   TEXT DEFAULT NULL,
  p_booking_id UUID DEFAULT NULL,
  p_enquiry_id UUID DEFAULT NULL,
  p_client_id  UUID DEFAULT NULL,
  p_send_after TIMESTAMPTZ DEFAULT now()
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.booking_emails (
    kind, dedupe_key, detail, to_email, to_phone,
    booking_id, enquiry_id, client_id, send_after
  ) VALUES (
    p_kind, p_dedupe_key, p_detail, p_to_email, p_to_phone,
    p_booking_id, p_enquiry_id, p_client_id, p_send_after
  );
  RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
  RETURN FALSE;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_customer_message(
  TEXT, TEXT, JSONB, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_customer_message(
  TEXT, TEXT, JSONB, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ) TO service_role;

-- ============================================================
-- 2. THE RECALL
-- ============================================================

/**
 * Vehicles whose MOT is running out, and who to tell.
 *
 * Reads `vehicle_lookups`, which the DVLA lookup has been populating since it
 * shipped, joined to the most recent enquiry for that registration — because
 * that is where the customer's name and number are.
 *
 * Two conditions worth their comments:
 *
 *   * `marketing_consent` is *not* required. An MOT expiry is a legal deadline
 *     the customer already has; telling them about it is a service message
 *     about work this business did or quoted, not a marketing broadcast. What
 *     is required is a prior relationship — the join to `enquiries` is what
 *     provides it. This site does not send to registrations it was never asked
 *     about.
 *
 *   * Vehicles marked for export or already expired are excluded. A reminder
 *     about an MOT that ran out four months ago is not a service, and the
 *     customer has almost certainly dealt with it elsewhere.
 */
CREATE OR REPLACE FUNCTION public.vehicles_due_mot(p_days INT DEFAULT 30)
RETURNS TABLE (
  registration    TEXT,
  mot_expiry_date DATE,
  days_remaining  INT,
  customer_name   TEXT,
  customer_phone  TEXT,
  customer_email  TEXT,
  enquiry_id      UUID,
  client_id       UUID,
  vehicle_make    TEXT,
  vehicle_model   TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (vl.registration)
    vl.registration,
    vl.mot_expiry_date,
    (vl.mot_expiry_date - CURRENT_DATE)::int,
    e.customer_name,
    e.customer_phone,
    e.customer_email,
    e.id,
    e.client_id,
    vl.make,
    vl.model
  FROM public.vehicle_lookups vl
  JOIN public.enquiries e ON upper(e.registration) = upper(vl.registration)
  WHERE vl.mot_expiry_date IS NOT NULL
    AND vl.mot_expiry_date >= CURRENT_DATE
    AND vl.mot_expiry_date <= CURRENT_DATE + p_days
    AND COALESCE(vl.marked_for_export, FALSE) = FALSE
    -- A lost enquiry means they went elsewhere; chasing them is not a service.
    AND e.status <> 'lost'
  ORDER BY vl.registration, e.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.vehicles_due_mot(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vehicles_due_mot(INT) TO authenticated, service_role;

/**
 * Queue a reminder for every vehicle due one.
 *
 * The dedupe key includes the expiry date, so re-running this is free and a
 * vehicle that passes its MOT — getting a new, later expiry — becomes eligible
 * again next year without anybody clearing anything.
 */
CREATE OR REPLACE FUNCTION public.queue_mot_recalls(p_days INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT * FROM public.vehicles_due_mot(p_days) LOOP
    IF r.customer_email IS NULL AND r.customer_phone IS NULL THEN
      CONTINUE;
    END IF;
    IF public.enqueue_customer_message(
      'mot_recall',
      'mot:' || upper(r.registration) || ':' || r.mot_expiry_date::text,
      jsonb_build_object(
        'registration',    r.registration,
        'mot_expiry_date', r.mot_expiry_date,
        'days_remaining',  r.days_remaining,
        'customer_name',   r.customer_name,
        'vehicle_make',    r.vehicle_make,
        'vehicle_model',   r.vehicle_model
      ),
      r.customer_email, r.customer_phone,
      NULL, r.enquiry_id, r.client_id
    ) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.queue_mot_recalls(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_mot_recalls(INT) TO service_role;

/**
 * Remind somebody their job is tomorrow.
 *
 * The other half of what a diary is for. Same queue, same dedupe discipline.
 */
CREATE OR REPLACE FUNCTION public.queue_booking_reminders(p_hours INT DEFAULT 24)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT b.*, c.email, c.phone, c.first_name
      FROM public.bookings b
      LEFT JOIN public.clients c ON c.id = b.client_id
     WHERE b.status = 'confirmed'
       AND b.starts_at > now()
       AND b.starts_at <= now() + make_interval(hours => p_hours)
  LOOP
    IF public.enqueue_customer_message(
      'booking_reminder',
      'reminder:' || r.id::text,
      jsonb_build_object(
        'service_name', r.service_name,
        'starts_at',    r.starts_at,
        'postcode',     r.postcode,
        'first_name',   r.first_name,
        'registration', r.registration
      ),
      r.email, r.phone, r.id, r.enquiry_id, r.client_id
    ) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.queue_booking_reminders(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_booking_reminders(INT) TO service_role;

-- ============================================================
-- 3. REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID REFERENCES public.bookings (id) ON DELETE SET NULL,
  client_id    UUID REFERENCES public.clients (id) ON DELETE SET NULL,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         TEXT,
  author_name  TEXT,
  /* Nothing appears on the website until a human has looked at it. Not because
     bad reviews are hidden — because anonymous free text on a public page is an
     invitation. */
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reviews_status_idx ON public.reviews (status, submitted_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reviews FROM anon;
DROP POLICY IF EXISTS "staff_manage_reviews" ON public.reviews;
CREATE POLICY "staff_manage_reviews" ON public.reviews
  FOR ALL TO authenticated
  USING (public.has_staff_role()) WITH CHECK (public.has_staff_role());

CREATE OR REPLACE FUNCTION public.get_approved_reviews(_limit INT DEFAULT 24)
RETURNS TABLE (id UUID, rating SMALLINT, body TEXT, author_name TEXT, submitted_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rating, r.body, r.author_name, r.submitted_at
    FROM public.reviews r
   WHERE r.status = 'approved'
   ORDER BY r.submitted_at DESC
   LIMIT LEAST(GREATEST(_limit, 1), 100);
$$;

/**
 * The averages, computed over approved reviews only.
 *
 * The same set the website shows. A summary counting pending or rejected
 * reviews would be a number the page cannot justify.
 */
CREATE OR REPLACE FUNCTION public.get_review_summary()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'count',   count(*),
    'average', CASE WHEN count(*) = 0 THEN NULL
                    ELSE round(avg(rating)::numeric, 2) END,
    'pending', (SELECT count(*) FROM public.reviews WHERE status = 'pending')
  )
  FROM public.reviews WHERE status = 'approved';
$$;

REVOKE ALL ON FUNCTION public.get_approved_reviews(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_reviews(INT) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_review_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_review_summary() TO anon, authenticated, service_role;

/**
 * Invite a review once the work is done.
 *
 * Only for completed jobs, and only once each — asking somebody to review work
 * that has not happened is the fastest way to make every future message from
 * this business ignorable.
 */
CREATE OR REPLACE FUNCTION public.queue_review_invites(p_after_hours INT DEFAULT 24)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT b.*, c.email, c.phone, c.first_name
      FROM public.bookings b
      LEFT JOIN public.clients c ON c.id = b.client_id
     WHERE b.status = 'completed'
       AND b.completed_at IS NOT NULL
       AND b.completed_at <= now() - make_interval(hours => p_after_hours)
       AND NOT EXISTS (SELECT 1 FROM public.reviews rv WHERE rv.booking_id = b.id)
  LOOP
    IF public.enqueue_customer_message(
      'review_invite', 'review:' || r.id::text,
      jsonb_build_object('service_name', r.service_name, 'first_name', r.first_name),
      r.email, r.phone, r.id, r.enquiry_id, r.client_id
    ) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.queue_review_invites(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_review_invites(INT) TO service_role;

-- ============================================================
-- 4. THE SWEEP
-- ============================================================
--
-- Same shape as `dispatch_owner_alerts()`, pointed at a different edge function
-- and a different audience. Schedule after deploying:
--
--   SELECT cron.schedule('customer-messages', '* * * * *',
--     $$SELECT public.dispatch_customer_messages()$$);
--   SELECT cron.schedule('mot-recalls', '0 8 * * *',
--     $$SELECT public.queue_mot_recalls(30)$$);
--   SELECT cron.schedule('booking-reminders', '0 * * * *',
--     $$SELECT public.queue_booking_reminders(24)$$);
--   SELECT cron.schedule('review-invites', '0 10 * * *',
--     $$SELECT public.queue_review_invites(24)$$);
--
-- The queueing jobs are safe to run more often than this; the dedupe key makes
-- a second run in the same day a no-op.
CREATE OR REPLACE FUNCTION public.dispatch_customer_messages()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_url TEXT := current_setting('app.settings.functions_url', TRUE);
  v_key TEXT := current_setting('app.settings.service_role_key', TRUE);
  v_count INT := 0;
BEGIN
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'dispatch_customer_messages: functions_url or service_role_key unset';
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, kind, detail, to_email, to_phone
      FROM public.booking_emails
     WHERE sent_at IS NULL AND send_after <= now()
     ORDER BY send_after LIMIT 50
  LOOP
    -- Marked before sending, deliberately. A crash between the two loses one
    -- message; the other order sends it repeatedly, and a customer receiving
    -- the same MOT reminder nine times is worse than not receiving it.
    UPDATE public.booking_emails SET sent_at = now() WHERE id = r.id;

    PERFORM net.http_post(
      url := v_url || '/notify-customer',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'kind', r.kind, 'detail', r.detail,
        'to_email', r.to_email, 'to_phone', r.to_phone
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_customer_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_customer_messages() TO service_role;
