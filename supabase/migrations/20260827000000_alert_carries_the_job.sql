-- Put the job in the doorbell.
--
-- `alert_on_new_enquiry()` sent who and which car, but not what they actually
-- wanted doing. That is the one field the alert exists to convey: reading
-- "Sam Taylor, AB12 CDE, GU15, indicative £340" on a phone tells you an
-- enquiry happened, and nothing about whether it is a filter change or a
-- clutch — so every alert ended at "open the laptop and look".
--
-- Now that the job is entered into TechMan (§28) rather than answered in the
-- admin page, that round trip is the whole cost. An alert carrying the work
-- requested, the mileage and an email address is one a person can act on from
-- where they are standing.
--
-- Only the trigger's payload changes. The queue, the sweep, the settings and
-- the delivery path are untouched, and an alert already sitting in the queue
-- when this deploys still renders correctly — the edge function treats every
-- one of these fields as optional, because rows written before this migration
-- will not have them.

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
      -- Optional on the enquiry, and genuinely often absent: a mobile number
      -- is enough to run this business on. Sent so the alert can carry it when
      -- it is there, never rendered as a blank line when it is not.
      'customer_email', NEW.customer_email,
      'registration', NEW.registration,
      'mileage', NEW.mileage,
      'postcode', NEW.postcode,
      -- The frozen basket. Carries each line's pricing type, which is what says
      -- at a glance whether this can be estimated from the desk or needs the
      -- car looking at first.
      'items', NEW.items,
      'quote_only_count', NEW.quote_only_count,
      'indicative_total_gbp', NEW.indicative_total_gbp,
      'preferred_date', NEW.preferred_date,
      'preferred_window', NEW.preferred_window
    ));
  END IF;

  RETURN NEW;
END;
$$;
