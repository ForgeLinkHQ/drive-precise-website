-- The diary: a slot is a time and a place, and two of them cannot overlap.
--
-- The rules being checked here are not in TypeScript anywhere. Availability is
-- a plpgsql function, non-overlap is an exclusion constraint, and the hold
-- lifecycle is a status plus a timestamp. All three are the kind of thing that
-- looks right when read and turns out to be wrong when run.

BEGIN;

-- A real job: an hour and a half of work, half an hour of driving.
INSERT INTO public.services
  (id, name, category, pricing, price_gbp, customer_type, is_active,
   duration_minutes, travel_minutes)
VALUES
  ('t-brakes', 'Front brake pads and discs', 'brakes-suspension', 'from', 289.00,
   'retail', TRUE, 90, 30),
  -- A quote-only service has no duration, because nobody knows how long it
  -- takes until they have seen the car.
  ('t-quote-only', 'Diagnostic investigation', 'repairs', 'quote', NULL,
   'retail', TRUE, NULL, 30);

-- A Wednesday a fortnight out at 09:00 local: comfortably past the 24-hour
-- notice, comfortably inside the 90-day horizon, and on the half-hour grid.
CREATE TEMP TABLE t_when AS
SELECT
  ((date_trunc('week', (now() AT TIME ZONE 'Europe/London'))
    + interval '2 weeks' + interval '2 days')::date + time '09:00')
    AT TIME ZONE 'Europe/London' AS start_at;

-- ── What cannot be put in a diary ─────────────────────────────────────────
SELECT harness.eq(
  public.slot_unavailable_reason('t-quote-only', (SELECT start_at FROM t_when)),
  'no_duration',
  'a quote-only service cannot be booked, because nobody knows how long it takes'
);
SELECT harness.eq(
  public.slot_unavailable_reason('nope', (SELECT start_at FROM t_when)),
  'unknown_service',
  'an unknown service is refused rather than assumed'
);
SELECT harness.eq(
  public.slot_unavailable_reason('t-brakes', (SELECT start_at FROM t_when) + interval '7 minutes'),
  'off_grid',
  'a start time off the half-hour grid is refused'
);
-- Truncated to the hour so these land on the grid: the alignment check runs
-- first and would otherwise mask the one being tested.
SELECT harness.eq(
  public.slot_unavailable_reason('t-brakes', date_trunc('hour', now() + interval '2 hours')),
  'too_soon',
  'two hours notice is not enough to order parts and plan a route'
);
SELECT harness.eq(
  public.slot_unavailable_reason('t-brakes', date_trunc('hour', now() + interval '200 days')),
  'too_far_ahead',
  'and two hundred days is beyond the horizon'
);

-- ── The good case ─────────────────────────────────────────────────────────
SELECT harness.ok(
  public.slot_unavailable_reason('t-brakes', (SELECT start_at FROM t_when)) IS NULL,
  'a Wednesday morning a fortnight out is bookable'
);
SELECT harness.ok(
  (SELECT count(*) FROM public.get_available_slots('t-brakes',
     ((SELECT start_at FROM t_when) AT TIME ZONE 'Europe/London')::date)) > 5,
  'and the day offers a list of them'
);

-- ── Reserving ─────────────────────────────────────────────────────────────
CREATE TEMP TABLE t_booking AS
SELECT public.reserve_slot(
  't-brakes', (SELECT start_at FROM t_when), '07700900123',
  'Sam', 'Taylor', NULL, 'GU14 7PA', NULL, 340.00, 'home', 'AB12CDE', 'portal'
) AS b;

SELECT harness.eq(
  (SELECT (b->>'agreed_price_gbp')::numeric FROM t_booking),
  340.00::numeric,
  'the agreed price wins over the catalogue price'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.clients WHERE phone = '07700900123'),
  1,
  'reserving creates the customer record'
);

-- The whole point of the travel allowance.
SELECT harness.eq(
  (SELECT (b->>'blocked_until')::timestamptz - (b->>'ends_at')::timestamptz FROM t_booking),
  interval '30 minutes',
  'the diary blocks the drive as well as the work'
);

-- ── Two jobs cannot occupy one van ────────────────────────────────────────
SELECT harness.eq(
  public.slot_unavailable_reason('t-brakes', (SELECT start_at FROM t_when)),
  'taken',
  'the same slot is no longer available'
);
-- 09:00 + 90 minutes of work = 10:30, + 30 minutes of driving = 11:00. A job at
-- 10:30 does not overlap the work and is still impossible.
SELECT harness.eq(
  public.slot_unavailable_reason('t-brakes', (SELECT start_at FROM t_when) + interval '90 minutes'),
  'taken',
  'and neither is the slot the mechanic would still be driving to'
);
SELECT harness.ok(
  public.slot_unavailable_reason('t-brakes', (SELECT start_at FROM t_when) + interval '120 minutes') IS NULL,
  'the slot after the drive is free'
);

-- The constraint, not the check, is the thing that actually holds. Insert
-- directly and it still refuses.
SELECT harness.raises(
  $q$ INSERT INTO public.bookings
        (service_id, service_name, agreed_price_gbp, starts_at, ends_at,
         blocked_until, status)
      SELECT 't-brakes', 'x', 10, start_at, start_at + interval '30 minutes',
             start_at + interval '30 minutes', 'confirmed'
        FROM t_when $q$,
  'the exclusion constraint refuses an overlap even when the checks are skipped'
);

-- ── Blackouts and closures ────────────────────────────────────────────────
INSERT INTO public.blackout_periods (starts_at, ends_at, reason)
SELECT start_at + interval '1 day', start_at + interval '1 day 8 hours', 'Training'
  FROM t_when;
SELECT harness.eq(
  public.slot_unavailable_reason('t-brakes', (SELECT start_at + interval '1 day' FROM t_when)),
  'blackout',
  'a blackout closes the day it covers'
);

SELECT harness.eq(
  public.slot_unavailable_reason('t-brakes',
    (((SELECT start_at FROM t_when) AT TIME ZONE 'Europe/London')::date + time '19:00')
      AT TIME ZONE 'Europe/London'),
  'outside_hours',
  'seven in the evening is outside the working day'
);

-- ── Holds lapse, and the slot comes back ──────────────────────────────────
UPDATE public.booking_settings SET default_deposit_gbp = 50 WHERE id = 1;

CREATE TEMP TABLE t_held AS
SELECT public.reserve_slot(
  't-brakes', (SELECT start_at + interval '2 days' FROM t_when), '07700900999',
  'Jo', 'Blake', NULL, 'GU14 7PA', NULL, 289.00, 'home', 'ZZ99YYY', 'quote_accept'
) AS b;

SELECT harness.eq(
  (SELECT b->>'status' FROM t_held), 'pending_payment',
  'a deposit means the slot is held rather than confirmed'
);
SELECT harness.eq(
  public.slot_unavailable_reason('t-brakes', (SELECT start_at + interval '2 days' FROM t_when)),
  'taken',
  'and a live hold blocks the slot'
);

UPDATE public.bookings SET hold_expires_at = now() - interval '1 minute'
 WHERE status = 'pending_payment';
SELECT harness.eq(public.cancel_expired_holds(), 1, 'a lapsed hold is released');
SELECT harness.ok(
  public.slot_unavailable_reason('t-brakes', (SELECT start_at + interval '2 days' FROM t_when)) IS NULL,
  'and the slot is available again'
);

-- ── Moving a booking along ────────────────────────────────────────────────
SELECT harness.raises(
  $q$ SELECT public.record_booking_status_change(
        (SELECT id FROM public.bookings WHERE status = 'confirmed' LIMIT 1),
        'cancelled') $q$,
  'a cancellation with no reason is refused'
);

SELECT harness.raises(
  $q$ SELECT public.record_booking_status_change(
        (SELECT id FROM public.bookings WHERE status = 'cancelled' LIMIT 1),
        'completed') $q$,
  'a job that was never confirmed cannot be completed'
);

SELECT public.record_booking_status_change(
  (SELECT id FROM public.bookings WHERE status = 'confirmed' LIMIT 1), 'completed');

SELECT harness.eq(
  (SELECT visits_count FROM public.clients WHERE phone = '07700900123'), 1,
  'completing a job is what makes somebody a returning customer'
);
SELECT harness.eq(
  (SELECT lifetime_spend_gbp FROM public.clients WHERE phone = '07700900123'),
  340.00::numeric,
  'and the spend recorded is what was agreed, not what the catalogue says'
);
SELECT harness.ok(
  (SELECT completed_at IS NOT NULL FROM public.bookings WHERE status = 'completed'),
  'the timestamp is stamped by the database rather than remembered by a person'
);

ROLLBACK;
