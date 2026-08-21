-- Alert settings, one row per event — under the name the platform uses.
--
-- This site modelled them as typed booleans on a single row: on_new_enquiry,
-- on_trade_enquiry, on_quote_accepted, on_stale_enquiry. A perfectly good shape
-- and the wrong one for a platform.
--
-- The Portal's alert panel is shared by every trade and reads a row per event.
-- Against typed columns it found nothing it recognised and rendered "alerts
-- aren't set up on this site yet" — while they were set up and firing. The
-- owner received alerts they could not switch off, on a page telling them they
-- had none. That is worse than a visible error, because nothing looks broken.
--
-- One row per event is also why the module claims that shape: adding an event
-- becomes an INSERT rather than a migration, and a trade with eleven events and
-- a trade with four use the same table and the same page.

-- ── The new shape, under the platform's name ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.owner_alert_settings (
  event      TEXT PRIMARY KEY CHECK (event IN (
               'new_enquiry', 'trade_enquiry', 'quote_accepted', 'stale_enquiry',
               'booking', 'review'
             )),
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_alert_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_alert_settings FROM anon;
GRANT ALL ON public.owner_alert_settings TO service_role;

DROP POLICY IF EXISTS "staff_read_alert_settings" ON public.owner_alert_settings;
CREATE POLICY "staff_read_alert_settings" ON public.owner_alert_settings
  FOR SELECT TO authenticated USING (public.has_staff_role());
DROP POLICY IF EXISTS "admin_manage_alert_settings" ON public.owner_alert_settings;
CREATE POLICY "admin_manage_alert_settings" ON public.owner_alert_settings
  FOR ALL TO authenticated
  USING (public.has_admin_role()) WITH CHECK (public.has_admin_role());

DROP TRIGGER IF EXISTS owner_alert_settings_touch ON public.owner_alert_settings;
CREATE TRIGGER owner_alert_settings_touch BEFORE UPDATE ON public.owner_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Whatever the owner had already chosen, read off the renamed table before its
-- boolean columns are dropped below. An alert somebody switched off stays off.
INSERT INTO public.owner_alert_settings (event, enabled)
SELECT 'new_enquiry',    COALESCE(on_new_enquiry, TRUE)    FROM public.owner_alert_recipient
UNION ALL SELECT 'trade_enquiry',  COALESCE(on_trade_enquiry, TRUE)  FROM public.owner_alert_recipient
UNION ALL SELECT 'quote_accepted', COALESCE(on_quote_accepted, TRUE) FROM public.owner_alert_recipient
UNION ALL SELECT 'stale_enquiry',  COALESCE(on_stale_enquiry, TRUE)  FROM public.owner_alert_recipient
ON CONFLICT (event) DO NOTHING;

-- Two sources of truth for one setting is how a toggle stops working with
-- nobody able to say why.
ALTER TABLE public.owner_alert_recipient
  DROP COLUMN IF EXISTS on_new_enquiry,
  DROP COLUMN IF EXISTS on_trade_enquiry,
  DROP COLUMN IF EXISTS on_quote_accepted,
  DROP COLUMN IF EXISTS on_stale_enquiry;

-- Anything not carried over defaults to on. A business that has not thought
-- about alerts should be told when work comes in, not silently not told.
INSERT INTO public.owner_alert_settings (event, enabled)
SELECT e, TRUE FROM unnest(ARRAY[
  'new_enquiry', 'trade_enquiry', 'quote_accepted', 'stale_enquiry', 'booking', 'review'
]) AS e
ON CONFLICT (event) DO NOTHING;

-- ── One place that answers "should this alert fire?" ──────────────────────
CREATE OR REPLACE FUNCTION public.alert_enabled(_event TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Absent means on, which is the same default the typed columns had via
  -- COALESCE(..., TRUE). A missing row must never mean silence.
  SELECT COALESCE(
    (SELECT enabled FROM public.owner_alert_settings WHERE event = _event),
    TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.alert_enabled(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alert_enabled(TEXT) TO authenticated, service_role;

-- ── The triggers now ask that question ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alert_on_new_enquiry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.alert_enabled('new_enquiry') THEN
    PERFORM public.enqueue_owner_alert('new_enquiry', jsonb_build_object(
      'enquiry_id',   NEW.id,
      'reference',    NEW.reference,
      'customer_name', NEW.customer_name,
      'customer_phone', NEW.customer_phone,
      'registration', NEW.registration,
      'indicative_total_gbp', NEW.indicative_total_gbp
    ));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.alert_on_quote_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'quote_accepted' AND OLD.status IS DISTINCT FROM 'quote_accepted' THEN
    IF public.alert_enabled('quote_accepted') THEN
      PERFORM public.enqueue_owner_alert('quote_accepted', jsonb_build_object(
        'enquiry_id',    NEW.id,
        'reference',     NEW.reference,
        'customer_name', NEW.customer_name,
        'customer_phone', NEW.customer_phone,
        'registration',  NEW.registration,
        'quoted_total_gbp', NEW.quoted_total_gbp
      ));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.alert_on_trade_enquiry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.alert_enabled('trade_enquiry') THEN
    PERFORM public.enqueue_owner_alert('trade_enquiry', jsonb_build_object(
      'trade_enquiry_id', NEW.id,
      'business_name',    NEW.business_name,
      'contact_name',     NEW.contact_name,
      'phone',            NEW.phone,
      'email',            NEW.email
    ));
  END IF;
  RETURN NEW;
END;
$$;

-- `queue_stale_enquiry_alerts` reads the same setting and has to be rewritten
-- with the rest of them, or dropping the column below breaks the sweep.
CREATE OR REPLACE FUNCTION public.queue_stale_enquiry_alerts(p_hours INT DEFAULT 24)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT := 0;
BEGIN
  IF NOT public.alert_enabled('stale_enquiry') THEN
    RETURN 0;
  END IF;

  -- One statement, not two. A CTE lives for the length of the statement that
  -- declares it, so counting in one and inserting in another leaves the second
  -- with no `stale` to read — which is exactly what the test caught.
  INSERT INTO public.owner_alert_queue (event, detail)
  SELECT 'stale_enquiry', jsonb_build_object(
    'enquiry_id',     e.id,
    'reference',      e.reference,
    'customer_name',  e.customer_name,
    'customer_phone', e.customer_phone,
    'registration',   e.registration,
    'created_at',     e.created_at
  )
    FROM public.enquiries e
   WHERE e.status = 'new'
     AND e.created_at < now() - make_interval(hours => GREATEST(p_hours, 1))
     -- Once told, not told again. Without this the sweep re-reports the same
     -- neglected enquiry every time it runs until somebody touches it.
     AND NOT EXISTS (
       SELECT 1 FROM public.owner_alert_queue q
        WHERE q.event = 'stale_enquiry'
          AND (q.detail->>'enquiry_id')::uuid = e.id
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_stale_enquiry_alerts(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_stale_enquiry_alerts(INT) TO service_role;

COMMENT ON TABLE public.owner_alert_settings IS
  'Which events raise an owner alert, one row each. The address lives in owner_alert_recipient.';

-- ── Two columns the shared console pages expect ───────────────────────────
--
-- Both are surfaces automotive did not reach until the customers and reviews
-- modules were switched on, and both would have failed at PostgREST with a 400
-- the page renders as an empty state. Found by the column audit once it started
-- checking every trade that has a table rather than passing as soon as one did.

-- The Portal's tag editor orders by this, and offers a description.
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- The Reviews page stamps this when somebody approves a review, which is how
-- "approved last week" is answerable at all.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
