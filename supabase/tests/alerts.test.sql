-- Owner alerts: one settings row, a boolean per event, and a toggle that does
-- something.
--
-- This site keeps its alert switches as typed columns on a single row pinned
-- to id = 1. The Portal's automotive alert panel reads exactly those columns
-- (`pages/client/automotive/AlertSettings.tsx`), so this file is the database
-- half of that contract: the row exists, the columns exist, the Portal may
-- write them, and switching one off actually silences the event.
--
-- The alert also has to carry the job. Since the work is entered into TechMan
-- rather than answered from the admin page, an alert that says who and which
-- car but not what they wanted is a round trip to a laptop — so the payload is
-- asserted too.

BEGIN;

-- ── The row ───────────────────────────────────────────────────────────────
SELECT harness.eq(
  (SELECT count(*)::int FROM public.owner_alert_settings), 1,
  'one settings row, seeded by the migration'
);
SELECT harness.ok(
  (SELECT on_new_enquiry AND on_trade_enquiry AND on_quote_accepted AND on_stale_enquiry
     FROM public.owner_alert_settings WHERE id = 1),
  'every alert starts on — a business that has not thought about alerts should still be told'
);
SELECT harness.raises(
  $q$ INSERT INTO public.owner_alert_settings (id) VALUES (2) $q$,
  'there is exactly one row, and a second cannot be added'
);

-- ── The columns the Portal panel reads and writes ─────────────────────────
DO $$
DECLARE col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'on_new_enquiry', 'on_trade_enquiry', 'on_quote_accepted', 'on_stale_enquiry', 'notify_email'
  ] LOOP
    PERFORM harness.ok(
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'owner_alert_settings'
                 AND column_name = col),
      'owner_alert_settings has ' || col
    );
  END LOOP;
END
$$;
SELECT harness.ok(
  has_table_privilege('service_role', 'public.owner_alert_settings', 'UPDATE'),
  'the Portal can save a toggle'
);
SELECT harness.ok(
  NOT has_table_privilege('anon', 'public.owner_alert_settings', 'SELECT'),
  'the public website cannot read the owner''s alert address'
);

-- ── An enquiry rings the doorbell, and the doorbell says what the job is ──
INSERT INTO public.enquiries
  (customer_name, customer_phone, customer_email, registration, mileage, postcode,
   items, indicative_total_gbp, quote_only_count, status)
VALUES
  ('Sam Taylor', '07700900123', 'sam@example.com', 'AB12CDE', 64000, 'GU15',
   '[{"kind":"service","id":"minor-service","name":"Minor service","pricing":"fixed","priceGbp":189},
     {"kind":"service","id":"clutch","name":"Clutch","pricing":"quote"}]'::jsonb,
   189.00, 1, 'new');

SELECT harness.eq(
  (SELECT count(*)::int FROM public.owner_alert_queue WHERE event = 'new_enquiry'), 1,
  'an enquiry queues an alert'
);
SELECT harness.eq(
  (SELECT jsonb_array_length(detail -> 'items') FROM public.owner_alert_queue WHERE event = 'new_enquiry'),
  2,
  'and the alert carries the work requested, line by line'
);
SELECT harness.eq(
  (SELECT detail -> 'items' -> 1 ->> 'pricing' FROM public.owner_alert_queue WHERE event = 'new_enquiry'),
  'quote',
  'with each line''s pricing type, so the reader knows what needs the car looking at'
);
SELECT harness.eq(
  (SELECT detail ->> 'customer_email' FROM public.owner_alert_queue WHERE event = 'new_enquiry'),
  'sam@example.com',
  'and the email address when there is one'
);
SELECT harness.eq(
  (SELECT (detail ->> 'mileage')::int FROM public.owner_alert_queue WHERE event = 'new_enquiry'),
  64000,
  'and the mileage'
);
SELECT harness.ok(
  (SELECT detail ->> 'phone' IS NOT NULL FROM public.owner_alert_queue WHERE event = 'new_enquiry'),
  'the customer data is in the queue row, which no browser role can read'
);
SELECT harness.ok(
  NOT has_table_privilege('anon', 'public.owner_alert_queue', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.owner_alert_queue', 'SELECT'),
  'and it really cannot'
);

-- ── Switching one off actually stops it ───────────────────────────────────
UPDATE public.owner_alert_settings SET on_new_enquiry = FALSE WHERE id = 1;
INSERT INTO public.enquiries (customer_name, customer_phone, registration, items, status)
VALUES ('Jo Blake', '07700900999', 'ZZ99YYY', '[]'::jsonb, 'new');
SELECT harness.eq(
  (SELECT count(*)::int FROM public.owner_alert_queue WHERE event = 'new_enquiry'), 1,
  'switching it off stops the next one — the toggle does something'
);

-- ── The stale sweep reads the same row ────────────────────────────────────
UPDATE public.owner_alert_settings SET on_stale_enquiry = FALSE WHERE id = 1;
UPDATE public.enquiries SET created_at = now() - interval '3 days';
SELECT harness.eq(
  public.queue_stale_enquiry_alerts(24), 0,
  'the stale sweep is switched off from the same place'
);
UPDATE public.owner_alert_settings SET on_stale_enquiry = TRUE WHERE id = 1;
SELECT harness.eq(
  public.queue_stale_enquiry_alerts(24), 2,
  'and switched back on it reports both neglected enquiries'
);
SELECT harness.eq(
  public.queue_stale_enquiry_alerts(24), 0,
  'once each — a sweep that re-reports the same enquiry hourly gets ignored'
);

-- ── The dispatcher refuses to run half-configured ─────────────────────────
--
-- Without the functions URL and the service-role key it warns and sends
-- nothing, rather than posting fifty alerts at an empty URL. The go-live
-- runbook sets both; this is what "forgot to" looks like.
SELECT harness.eq(
  public.dispatch_owner_alerts(), 0,
  'with no delivery settings the sweep sends nothing and says so'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.owner_alert_queue WHERE sent_at IS NOT NULL), 0,
  'and marks nothing as sent'
);

ROLLBACK;
