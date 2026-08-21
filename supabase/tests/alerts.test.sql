-- Owner alerts: one row per event, and a missing row never means silence.
--
-- This shape replaced typed booleans on a single row. The old shape worked and
-- was the wrong one for a platform: the Portal's alert panel is shared by every
-- trade and reads `event` and `enabled`, so with typed columns it found nothing
-- it recognised and told the owner alerts were not set up — while they were set
-- up and firing. Receiving alerts you cannot turn off, with a page saying you
-- have none, is a worse failure than a visible error.

BEGIN;

SELECT harness.eq(
  (SELECT count(*)::int FROM public.owner_alert_settings), 6,
  'every event the site can raise has a row to switch'
);
SELECT harness.ok(
  (SELECT bool_and(enabled) FROM public.owner_alert_settings),
  'and they start on — a business that has not thought about alerts should be told when work comes in'
);

-- ── A missing row means on, not off ───────────────────────────────────────
DELETE FROM public.owner_alert_settings WHERE event = 'new_enquiry';
SELECT harness.ok(
  public.alert_enabled('new_enquiry'),
  'a deleted row still means on, because silence must never be the accident'
);
INSERT INTO public.owner_alert_settings (event, enabled) VALUES ('new_enquiry', TRUE);

-- ── Switching one off actually stops it ───────────────────────────────────
INSERT INTO public.enquiries
  (customer_name, customer_phone, registration, items, status)
VALUES ('Sam Taylor', '07700900123', 'AB12CDE', '[]'::jsonb, 'new');

SELECT harness.eq(
  (SELECT count(*)::int FROM public.owner_alert_queue WHERE event = 'new_enquiry'), 1,
  'an enquiry queues an alert'
);

UPDATE public.owner_alert_settings SET enabled = FALSE WHERE event = 'new_enquiry';
INSERT INTO public.enquiries
  (customer_name, customer_phone, registration, items, status)
VALUES ('Jo Blake', '07700900999', 'ZZ99YYY', '[]'::jsonb, 'new');

SELECT harness.eq(
  (SELECT count(*)::int FROM public.owner_alert_queue WHERE event = 'new_enquiry'), 1,
  'and switching it off stops the next one — the toggle does something'
);

-- ── The stale sweep reads the same switch ─────────────────────────────────
UPDATE public.owner_alert_settings SET enabled = FALSE WHERE event = 'stale_enquiry';
UPDATE public.enquiries SET created_at = now() - interval '3 days';
SELECT harness.eq(
  public.queue_stale_enquiry_alerts(24), 0,
  'the stale sweep is switched off too, from the same place'
);

UPDATE public.owner_alert_settings SET enabled = TRUE WHERE event = 'stale_enquiry';
SELECT harness.eq(
  public.queue_stale_enquiry_alerts(24), 2,
  'and switched back on it reports the neglected enquiries'
);
SELECT harness.eq(
  public.queue_stale_enquiry_alerts(24), 0,
  'once each — a sweep that re-reports the same enquiry nightly gets ignored'
);

-- ── The address is not a per-event setting ────────────────────────────────
SELECT harness.ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'owner_alert_recipient'
       AND column_name = 'notify_email'
  ),
  'the address has a table of its own — one recipient for the business, not a per-event setting'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'owner_alert_settings'
      AND column_name LIKE 'on\_%'),
  0,
  'and the typed columns are gone, so there is one source of truth'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.owner_alert_recipient), 1,
  'exactly one recipient row, seeded'
);

-- ── The two columns the shared console pages need ─────────────────────────
SELECT harness.ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='tags' AND column_name='sort_order'),
  'tags can be ordered, which the shared tag editor does'
);
SELECT harness.ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='reviews' AND column_name='approved_at'),
  'a review records when it was approved'
);

ROLLBACK;
