-- Wiring the doorbell.
--
-- Until now an enquiry was written to a table and nothing happened. No email,
-- no notification, nothing — the only way to learn that someone wanted work
-- doing was to open the admin page and look. For a business whose entire funnel
-- is "customer asks, human answers", that is the most expensive gap in the
-- system: the median time-to-contact the pipeline report now measures was, in
-- practice, however long it took somebody to remember to check.
--
-- The shape here is queue-then-dispatch rather than send-from-trigger, and that
-- is deliberate. A trigger that calls out over the network makes the customer's
-- INSERT depend on an email provider being reachable — if Resend is having a
-- bad afternoon, the enquiry itself fails and the customer sees an error for
-- something that is not their problem and not their fault. So the trigger only
-- writes a row, which cannot fail for network reasons, and a sweep sends them.
--
-- The consequence, stated rather than discovered: an alert can be up to a
-- minute late. That is the correct trade for never losing an enquiry.

-- ============================================================
-- 1. THE QUEUE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.owner_alert_queue (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event      TEXT NOT NULL CHECK (event IN (
               'new_enquiry', 'trade_enquiry', 'quote_accepted', 'stale_enquiry'
             )),
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ,
  error      TEXT
);

-- Partial index: the sweep only ever asks for unsent rows, and this table is
-- append-mostly, so indexing the sent ones would be paying for nothing.
CREATE INDEX IF NOT EXISTS owner_alert_queue_pending_idx
  ON public.owner_alert_queue (created_at) WHERE sent_at IS NULL;

ALTER TABLE public.owner_alert_queue ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.owner_alert_queue TO service_role;

-- No anon or authenticated grants at all. The detail JSONB carries the customer
-- information that triggered each alert — name, number, registration — and
-- nothing outside the dispatcher needs to read it. The Portal manages the
-- settings, never the queue.

CREATE OR REPLACE FUNCTION public.enqueue_owner_alert(_event TEXT, _detail JSONB)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.owner_alert_queue (event, detail) VALUES (_event, _detail);
$$;

-- ============================================================
-- 2. WHAT RAISES ONE
-- ============================================================

CREATE OR REPLACE FUNCTION public.alert_on_new_enquiry()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.owner_alert_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_settings FROM public.owner_alert_settings WHERE id = 1;

  IF COALESCE(v_settings.on_new_enquiry, TRUE) THEN
    PERFORM public.enqueue_owner_alert('new_enquiry', jsonb_build_object(
      'enquiry_id', NEW.id,
      'reference', NEW.reference,
      'customer_name', NEW.customer_name,
      'phone', NEW.customer_phone,
      'registration', NEW.registration,
      'postcode', NEW.postcode,
      'indicative_total_gbp', NEW.indicative_total_gbp,
      'preferred_date', NEW.preferred_date,
      'preferred_window', NEW.preferred_window
    ));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enquiries_alert_owner ON public.enquiries;
CREATE TRIGGER enquiries_alert_owner
  AFTER INSERT ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.alert_on_new_enquiry();

-- A quote being accepted is the moment work becomes likely and the moment a
-- date needs agreeing. Fires on the transition only, so re-saving a row that is
-- already accepted does not ring the bell twice.
CREATE OR REPLACE FUNCTION public.alert_on_quote_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.owner_alert_settings%ROWTYPE;
BEGIN
  IF NEW.status = 'quote_accepted' AND OLD.status IS DISTINCT FROM 'quote_accepted' THEN
    SELECT * INTO v_settings FROM public.owner_alert_settings WHERE id = 1;

    IF COALESCE(v_settings.on_quote_accepted, TRUE) THEN
      PERFORM public.enqueue_owner_alert('quote_accepted', jsonb_build_object(
        'enquiry_id', NEW.id,
        'reference', NEW.reference,
        'customer_name', NEW.customer_name,
        'phone', NEW.customer_phone,
        'registration', NEW.registration,
        'quoted_total_gbp', NEW.quoted_total_gbp
      ));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enquiries_alert_quote_accepted ON public.enquiries;
CREATE TRIGGER enquiries_alert_quote_accepted
  AFTER UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.alert_on_quote_accepted();

CREATE OR REPLACE FUNCTION public.alert_on_trade_enquiry()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.owner_alert_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_settings FROM public.owner_alert_settings WHERE id = 1;

  IF COALESCE(v_settings.on_trade_enquiry, TRUE) THEN
    PERFORM public.enqueue_owner_alert('trade_enquiry', jsonb_build_object(
      'trade_enquiry_id', NEW.id,
      'business_name', NEW.business_name,
      'contact_name', NEW.contact_name,
      'phone', NEW.phone,
      'business_postcode', NEW.business_postcode,
      'vehicles_per_month', NEW.vehicles_per_month
    ));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trade_enquiries_alert_owner ON public.trade_enquiries;
CREATE TRIGGER trade_enquiries_alert_owner
  AFTER INSERT ON public.trade_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.alert_on_trade_enquiry();

-- ============================================================
-- 3. THE ONE NOBODY ELSE RAISES
-- ============================================================
--
-- An enquiry that arrived and was never picked up raises nothing, because
-- nothing happened — and that is exactly the failure worth being told about.
-- This is the only alert derived from absence rather than from an event.
CREATE OR REPLACE FUNCTION public.queue_stale_enquiry_alerts(p_hours INT DEFAULT 24)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.owner_alert_settings%ROWTYPE;
  v_count INT := 0;
BEGIN
  SELECT * INTO v_settings FROM public.owner_alert_settings WHERE id = 1;
  IF NOT COALESCE(v_settings.on_stale_enquiry, TRUE) THEN
    RETURN 0;
  END IF;

  WITH stale AS (
    SELECT e.id, e.reference, e.customer_name, e.customer_phone, e.registration, e.created_at
      FROM public.enquiries e
     WHERE e.status = 'new'
       AND e.created_at < now() - make_interval(hours => GREATEST(p_hours, 1))
       -- Once told, not told again. Without this the sweep re-reports the same
       -- neglected enquiry every time it runs until somebody touches it, which
       -- trains the owner to ignore the alert that matters most.
       AND NOT EXISTS (
         SELECT 1 FROM public.owner_alert_queue q
          WHERE q.event = 'stale_enquiry'
            AND q.detail ->> 'enquiry_id' = e.id::text
       )
  ), queued AS (
    INSERT INTO public.owner_alert_queue (event, detail)
    SELECT 'stale_enquiry', jsonb_build_object(
      'enquiry_id', s.id,
      'reference', s.reference,
      'customer_name', s.customer_name,
      'phone', s.customer_phone,
      'registration', s.registration,
      'waiting_since', s.created_at
    ) FROM stale s
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM queued;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 4. SENDING THEM
-- ============================================================
--
-- Marks each row sent *before* the request goes out. Sending twice is an
-- annoyance; sending in a loop because the mark failed is an incident, and
-- pg_net posts asynchronously so there is no response to wait for anyway.
--
-- Schedule after deploy (Supabase → Database → Extensions → pg_cron):
--
--   SELECT cron.schedule('owner-alerts', '* * * * *',
--     $$SELECT public.dispatch_owner_alerts()$$);
--   SELECT cron.schedule('stale-enquiries', '0 * * * *',
--     $$SELECT public.queue_stale_enquiry_alerts(24)$$);
--
-- Both need `app.settings.service_role_key` and `app.settings.functions_url`
-- set as database settings, which the provisioning pipeline does.
CREATE OR REPLACE FUNCTION public.dispatch_owner_alerts()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_url TEXT := current_setting('app.settings.functions_url', TRUE);
  v_key TEXT := current_setting('app.settings.service_role_key', TRUE);
  v_count INT := 0;
BEGIN
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'dispatch_owner_alerts: functions_url or service_role_key unset';
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, event, detail FROM public.owner_alert_queue
     WHERE sent_at IS NULL ORDER BY created_at LIMIT 50
  LOOP
    UPDATE public.owner_alert_queue SET sent_at = now() WHERE id = r.id;

    PERFORM net.http_post(
      url := v_url || '/notify-owner',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('event', r.event, 'detail', r.detail)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_owner_alerts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_stale_enquiry_alerts(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_owner_alerts() TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_stale_enquiry_alerts(INT) TO service_role;
