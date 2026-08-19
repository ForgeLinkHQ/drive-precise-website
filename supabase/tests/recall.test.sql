-- MOT recall, reminders and review invites.
--
-- The recall is the highest-converting message this business can send, and it
-- runs on data that was already here: the DVLA lookup has been storing
-- `mot_expiry_date` since it shipped and nothing had ever read it.
--
-- What is really being tested is the dedupe discipline. These sweeps run on
-- cron, and the failure that matters is not "nothing sent" — it is a customer
-- getting the same reminder nine nights running.

BEGIN;

INSERT INTO public.services
  (id, name, category, pricing, price_gbp, customer_type, is_active,
   duration_minutes, travel_minutes)
VALUES ('t-mot-prep', 'MOT preparation', 'checks', 'fixed', 49.00, 'retail',
        TRUE, 60, 30);

-- A customer we have dealt with, whose MOT is three weeks away.
INSERT INTO public.enquiries
  (customer_name, customer_phone, customer_email, registration, items, status)
VALUES ('Sam Taylor', '07700900123', 'sam@example.com', 'AB12CDE', '[]'::jsonb, 'quoted');

INSERT INTO public.vehicle_lookups (registration, make, model, mot_expiry_date, source)
VALUES ('AB12CDE', 'BMW', '320d', CURRENT_DATE + 21, 'dvla-ves');

-- ── Who is due ────────────────────────────────────────────────────────────
SELECT harness.eq(
  (SELECT count(*)::int FROM public.vehicles_due_mot(30)), 1,
  'a vehicle three weeks from its MOT is due a reminder'
);
SELECT harness.eq(
  (SELECT days_remaining FROM public.vehicles_due_mot(30)), 21,
  'and the message knows how long they have'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.vehicles_due_mot(7)), 0,
  'a narrower window leaves them alone until nearer the time'
);

-- ── Who is not ────────────────────────────────────────────────────────────
INSERT INTO public.vehicle_lookups (registration, make, mot_expiry_date, source)
VALUES ('EXPIRED1', 'BMW', CURRENT_DATE - 120, 'dvla-ves');
INSERT INTO public.enquiries (customer_name, customer_phone, registration, items, status)
VALUES ('Old Customer', '07700900111', 'EXPIRED1', '[]'::jsonb, 'quoted');
SELECT harness.eq(
  (SELECT count(*)::int FROM public.vehicles_due_mot(30) WHERE registration = 'EXPIRED1'), 0,
  'an MOT that ran out four months ago is not a reminder, it is a nuisance'
);

INSERT INTO public.vehicle_lookups (registration, make, mot_expiry_date, marked_for_export, source)
VALUES ('EXPORT01', 'BMW', CURRENT_DATE + 14, TRUE, 'dvla-ves');
INSERT INTO public.enquiries (customer_name, customer_phone, registration, items, status)
VALUES ('Gone Abroad', '07700900222', 'EXPORT01', '[]'::jsonb, 'quoted');
SELECT harness.eq(
  (SELECT count(*)::int FROM public.vehicles_due_mot(30) WHERE registration = 'EXPORT01'), 0,
  'a vehicle marked for export has left'
);

INSERT INTO public.vehicle_lookups (registration, make, mot_expiry_date, source)
VALUES ('LOST0001', 'BMW', CURRENT_DATE + 14, 'dvla-ves');
INSERT INTO public.enquiries
  (customer_name, customer_phone, registration, items, status, lost_reason)
VALUES ('Went Elsewhere', '07700900333', 'LOST0001', '[]'::jsonb, 'lost', 'Price');
SELECT harness.eq(
  (SELECT count(*)::int FROM public.vehicles_due_mot(30) WHERE registration = 'LOST0001'), 0,
  'somebody who went elsewhere is not chased'
);

-- A registration nobody ever enquired about is not in the list at all: the join
-- to enquiries is what establishes there was ever a relationship.
INSERT INTO public.vehicle_lookups (registration, make, mot_expiry_date, source)
VALUES ('STRANGER', 'BMW', CURRENT_DATE + 14, 'dvla-ves');
SELECT harness.eq(
  (SELECT count(*)::int FROM public.vehicles_due_mot(30) WHERE registration = 'STRANGER'), 0,
  'a registration that was only ever looked up is never messaged'
);

-- ── Queueing, and queueing again ──────────────────────────────────────────
SELECT harness.eq(public.queue_mot_recalls(30), 1, 'one reminder is queued');
SELECT harness.eq(
  public.queue_mot_recalls(30), 0,
  'running the sweep again queues nothing — this is what stops nine emails'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.booking_emails WHERE kind = 'mot_recall'), 1,
  'and there is still exactly one message'
);

-- A vehicle that passes its MOT gets a new expiry, and becomes due again.
UPDATE public.vehicle_lookups SET mot_expiry_date = CURRENT_DATE + 21 + 365
 WHERE registration = 'AB12CDE';
SELECT harness.eq(
  (SELECT count(*)::int FROM public.vehicles_due_mot(30)), 0,
  'a renewed MOT is a year away and drops out of the window'
);
UPDATE public.vehicle_lookups SET mot_expiry_date = CURRENT_DATE + 20
 WHERE registration = 'AB12CDE';
SELECT harness.eq(
  public.queue_mot_recalls(30), 1,
  'and next year the new expiry is a new message, with nothing to reset'
);

-- ── Booking reminders ─────────────────────────────────────────────────────
-- Inserted directly rather than through reserve_slot. What is being tested is
-- the reminder sweep, and going through the front door would tie this to
-- whichever weekday the suite happens to run on — "tomorrow at this hour" is
-- outside business hours for most of the week, which is correct behaviour and
-- irrelevant here. reserve_slot has its own tests.
INSERT INTO public.clients (phone, first_name, last_name, email)
VALUES ('07700900555', 'Jo', 'Blake', 'jo@example.com');

CREATE TEMP TABLE t_book AS
WITH inserted AS (
  INSERT INTO public.bookings
    (client_id, service_id, service_name, agreed_price_gbp, starts_at, ends_at,
     blocked_until, travel_minutes, status, registration)
  SELECT c.id, 't-mot-prep', 'MOT preparation', 49.00,
         now() + interval '20 hours', now() + interval '21 hours',
         now() + interval '21 hours 30 minutes', 30, 'confirmed', 'JO11JOE'
    FROM public.clients c WHERE c.phone = '07700900555'
  RETURNING *
)
SELECT to_jsonb(inserted) AS b FROM inserted;

SELECT harness.eq(public.queue_booking_reminders(24), 1, 'tomorrow''s job is reminded');
SELECT harness.eq(public.queue_booking_reminders(24), 0, 'once');

-- ── Review invites ────────────────────────────────────────────────────────
SELECT harness.eq(
  public.queue_review_invites(24), 0,
  'nobody is asked to review work that has not happened'
);

SELECT public.record_booking_status_change(
  (SELECT (b->>'id')::uuid FROM t_book), 'completed');
UPDATE public.bookings SET completed_at = now() - interval '2 days'
 WHERE id = (SELECT (b->>'id')::uuid FROM t_book);

SELECT harness.eq(public.queue_review_invites(24), 1, 'a finished job earns one invitation');
SELECT harness.eq(public.queue_review_invites(24), 0, 'and only one');

INSERT INTO public.reviews (booking_id, rating, body, author_name, status)
SELECT (b->>'id')::uuid, 5, 'Turned up when he said he would.', 'Jo B', 'pending' FROM t_book;

SELECT harness.eq(
  (SELECT count(*)::int FROM public.get_approved_reviews()), 0,
  'nothing reaches the website before somebody has read it'
);
SELECT harness.eq(
  (SELECT (public.get_review_summary()->>'pending')::int), 1,
  'but the console is told there is one waiting'
);

UPDATE public.reviews SET status = 'approved';
SELECT harness.eq(
  (SELECT count(*)::int FROM public.get_approved_reviews()), 1,
  'approving publishes it'
);
SELECT harness.eq(
  (SELECT (public.get_review_summary()->>'average')::numeric), 5.00::numeric,
  'and the average counts approved reviews only'
);

ROLLBACK;
