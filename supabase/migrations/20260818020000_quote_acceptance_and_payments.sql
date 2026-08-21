-- From a quote to a paid, booked job.
--
-- ── What changes about "no Stripe on this site" ───────────────────────────
--
-- The rule was written as "deliberately no Stripe: nothing is paid for on this
-- site", and the principle behind it survives unchanged: **a quote request is
-- free and non-binding, and no price is payable until a human has seen the
-- vehicle and said what the work costs.** Nothing on the public site becomes
-- purchasable here. What becomes possible is the step after the quote — the
-- customer agreeing to a number a person gave them, and paying a deposit to
-- hold a date.
--
-- That is exactly what the automotive vertical has declared all along:
-- `paymentPoint: "on_quote_accept"`. This migration is that declaration
-- becoming true.
--
-- ── The link is the security boundary ─────────────────────────────────────
--
-- A customer accepting a quote has no account and never will. Making them
-- create one to agree to a price they were already given would lose quotes, so
-- acceptance is authorised by a link instead.
--
-- The token is stored as a SHA-256 hash and never in the clear. `preview_tokens`
-- stores its token raw, which is a defensible trade for a thirty-minute preview
-- of website copy; this token lives for a fortnight and authorises a payment, so
-- a leaked database backup must not be a set of working quote-acceptance links.
-- The raw value exists exactly once, in the return of `issue_quote_token()`, and
-- goes straight into an email.
--
-- Viewing and accepting are separated deliberately. The link can be opened as
-- often as the customer likes — people re-read a quote, forward it to a partner,
-- come back on a laptop — and acceptance happens once.

-- ============================================================
-- 1. THE LINK
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quote_tokens (
  /* SHA-256 of the raw token. Never the token itself. */
  token_hash  TEXT PRIMARY KEY,
  enquiry_id  UUID NOT NULL REFERENCES public.enquiries (id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  /* What was quoted when the link was sent. If the quote is revised the old
     link stops matching and stops working, so nobody can accept a superseded
     price by opening yesterday's email. */
  quoted_total_gbp NUMERIC(10, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS quote_tokens_enquiry_idx ON public.quote_tokens (enquiry_id);
CREATE INDEX IF NOT EXISTS quote_tokens_expiry_idx ON public.quote_tokens (expires_at);

ALTER TABLE public.quote_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_tokens FROM anon, authenticated;
GRANT ALL ON public.quote_tokens TO service_role;

-- `public, extensions` rather than plain `public`, and the second name is
-- load-bearing. `digest()` and `gen_random_bytes()` come from pgcrypto, which
-- Supabase installs into the `extensions` schema — so a definer function that
-- pins search_path to `public` alone cannot find them and fails at runtime with
-- "function digest(text, unknown) does not exist". A schema named here that does
-- not exist is ignored, so this is also correct on a plain PostgreSQL where
-- pgcrypto landed in public.
CREATE OR REPLACE FUNCTION public.hash_quote_token(p_token TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

/**
 * Mint a link for an enquiry that has been quoted.
 *
 * Returns the raw token, which is the only time it exists in readable form.
 * Any earlier link for the same enquiry is deleted: a revised quote must
 * invalidate the one before it, or a customer holding two emails could accept
 * whichever number they preferred.
 */
CREATE OR REPLACE FUNCTION public.issue_quote_token(
  p_enquiry_id UUID,
  p_days       INT DEFAULT 14
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_token   TEXT := encode(gen_random_bytes(32), 'hex');
  v_enquiry public.enquiries%ROWTYPE;
BEGIN
  SELECT * INTO v_enquiry FROM public.enquiries WHERE id = p_enquiry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_enquiry' USING ERRCODE = 'P0001';
  END IF;

  -- There is nothing to accept without a number a person put on it.
  IF v_enquiry.quoted_total_gbp IS NULL THEN
    RAISE EXCEPTION 'no_quote_to_accept' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.quote_tokens WHERE enquiry_id = p_enquiry_id;
  DELETE FROM public.quote_tokens WHERE expires_at < now();

  INSERT INTO public.quote_tokens (token_hash, enquiry_id, expires_at, quoted_total_gbp)
  VALUES (
    public.hash_quote_token(v_token),
    p_enquiry_id,
    now() + make_interval(days => p_days),
    v_enquiry.quoted_total_gbp
  );

  RETURN v_token;
END $$;

REVOKE ALL ON FUNCTION public.issue_quote_token(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_quote_token(UUID, INT) TO service_role;

/**
 * What the customer sees when they open the link.
 *
 * Callable by `anon`, because the person reading it has no account — so the
 * column list is the security boundary and is kept deliberately narrow. No
 * admin notes, no lost reason, no internal cost, no other enquiry. The
 * registration is included because the customer gave it and needs to check the
 * quote is for the right car; nothing is returned that they did not already
 * know or was not written for them.
 *
 * An expired or unknown token returns nothing rather than an error, so the link
 * cannot be used to find out which tokens exist.
 */
CREATE OR REPLACE FUNCTION public.get_quote_for_token(p_token TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'reference',        e.reference,
    'customer_name',    e.customer_name,
    'registration',     e.registration,
    'vehicle_make',     e.vehicle_make,
    'vehicle_model',    e.vehicle_model,
    'items',            e.items,
    'quoted_total_gbp', qt.quoted_total_gbp,
    'status',           e.status,
    'accepted_at',      qt.accepted_at,
    'expires_at',       qt.expires_at,
    'preferred_date',   e.preferred_date,
    'service_location', e.service_location,
    'postcode',         e.postcode
  )
  FROM public.quote_tokens qt
  JOIN public.enquiries e ON e.id = qt.enquiry_id
  WHERE qt.token_hash = public.hash_quote_token(p_token)
    AND qt.expires_at > now()
    -- A quote already turned into a job is no longer an offer.
    AND e.status NOT IN ('lost', 'completed');
$$;

REVOKE ALL ON FUNCTION public.get_quote_for_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_for_token(TEXT) TO anon, authenticated, service_role;

/**
 * The customer says yes.
 *
 * Idempotent on purpose. People double-click, and a payment provider will
 * redirect back through this page; accepting twice must not be an error and
 * must not produce two of anything.
 */
CREATE OR REPLACE FUNCTION public.accept_quote(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row     public.quote_tokens%ROWTYPE;
  v_enquiry public.enquiries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.quote_tokens
   WHERE token_hash = public.hash_quote_token(p_token) AND expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_expired_link' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_enquiry FROM public.enquiries WHERE id = v_row.enquiry_id;

  -- The quote must still be the one that was sent. If it has been revised, the
  -- customer is looking at a number that is no longer on offer.
  IF v_enquiry.quoted_total_gbp IS DISTINCT FROM v_row.quoted_total_gbp THEN
    RAISE EXCEPTION 'quote_has_changed' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.accepted_at IS NULL THEN
    UPDATE public.quote_tokens SET accepted_at = now() WHERE token_hash = v_row.token_hash;
    -- Only move it forwards. An enquiry already booked stays booked.
    IF v_enquiry.status IN ('quoted', 'contacted', 'awaiting_information', 'new') THEN
      UPDATE public.enquiries SET status = 'quote_accepted' WHERE id = v_row.enquiry_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'enquiry_id',       v_row.enquiry_id,
    'reference',        v_enquiry.reference,
    'quoted_total_gbp', v_row.quoted_total_gbp,
    'accepted',         TRUE
  );
END $$;

REVOKE ALL ON FUNCTION public.accept_quote(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_quote(TEXT) TO anon, authenticated, service_role;

-- ============================================================
-- 2. MONEY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID REFERENCES public.bookings (id) ON DELETE CASCADE,
  enquiry_id    UUID REFERENCES public.enquiries (id) ON DELETE SET NULL,

  kind          TEXT NOT NULL DEFAULT 'deposit'
                  CHECK (kind IN ('deposit', 'balance', 'refund')),
  status        TEXT NOT NULL DEFAULT 'requires_payment'
                  CHECK (status IN ('requires_payment', 'processing', 'succeeded',
                                    'failed', 'refunded')),
  amount_gbp    NUMERIC(10, 2) NOT NULL CHECK (amount_gbp > 0),
  currency      CHAR(3) NOT NULL DEFAULT 'gbp',

  stripe_payment_intent_id    TEXT UNIQUE,
  stripe_checkout_session_id  TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_booking_idx ON public.payments (booking_id);
CREATE INDEX IF NOT EXISTS payments_enquiry_idx ON public.payments (enquiry_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments FROM anon;
DROP POLICY IF EXISTS "staff_read_payments" ON public.payments;
CREATE POLICY "staff_read_payments" ON public.payments
  FOR SELECT TO authenticated USING (public.has_staff_role());

DROP TRIGGER IF EXISTS payments_touch ON public.payments;
CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- The webhook's idempotency ledger. Stripe delivers at least once and will
-- happily send the same event twice; without this a retried delivery confirms a
-- booking that was already confirmed and, worse, could double-count a payment.
--
-- RLS on with no policies at all is deny-by-construction for every role except
-- service_role, which is the only thing that should ever touch it.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_events FROM anon, authenticated;
GRANT ALL ON public.stripe_events TO service_role;

/**
 * Record that a Stripe event has been handled, or say it already was.
 *
 * Returns true the first time and false on every repeat, so the caller's whole
 * idempotency check is `IF NOT claim_stripe_event(...) THEN RETURN`.
 */
CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id TEXT,
  p_type     TEXT,
  p_payload  JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.stripe_events (event_id, type, payload)
  VALUES (p_event_id, p_type, p_payload);
  RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
  RETURN FALSE;
END $$;

REVOKE ALL ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB) TO service_role;

/**
 * A deposit has been paid: confirm the job and release the hold.
 *
 * One statement does all of it, because a paid deposit and an unconfirmed
 * booking is the worst state this system can be in — the customer has been
 * charged and the diary does not know.
 */
CREATE OR REPLACE FUNCTION public.settle_payment(
  p_payment_intent_id TEXT,
  p_status            TEXT DEFAULT 'succeeded'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  UPDATE public.payments SET status = p_status
   WHERE stripe_payment_intent_id = p_payment_intent_id
  RETURNING * INTO v_payment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_payment' USING ERRCODE = 'P0001';
  END IF;

  IF p_status = 'succeeded' AND v_payment.booking_id IS NOT NULL THEN
    UPDATE public.bookings
       SET deposit_paid    = TRUE,
           status          = CASE WHEN status = 'pending_payment'
                                  THEN 'confirmed' ELSE status END,
           hold_expires_at = NULL
     WHERE id = v_payment.booking_id
    RETURNING * INTO v_booking;

    IF v_booking.enquiry_id IS NOT NULL THEN
      UPDATE public.enquiries SET status = 'booked'
       WHERE id = v_booking.enquiry_id AND status <> 'completed';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status',     p_status,
    'booking_id', v_payment.booking_id,
    'booking_status', v_booking.status
  );
END $$;

REVOKE ALL ON FUNCTION public.settle_payment(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment(TEXT, TEXT) TO service_role;

/**
 * What the console needs to see about money, without the table.
 *
 * `payments` is readable by staff through RLS on the site itself, but the
 * Portal's proxy ignores RLS, so this is what it reads instead — and it joins
 * to the booking so a row is legible without a second query.
 */
CREATE OR REPLACE FUNCTION public.get_admin_payments(p_days INT DEFAULT 90)
RETURNS TABLE (
  id           UUID,
  booking_id   UUID,
  reference    TEXT,
  customer_name TEXT,
  service_name TEXT,
  kind         TEXT,
  status       TEXT,
  amount_gbp   NUMERIC,
  starts_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.booking_id, e.reference, e.customer_name,
    b.service_name, p.kind, p.status, p.amount_gbp, b.starts_at, p.created_at
  FROM public.payments p
  LEFT JOIN public.bookings b ON b.id = p.booking_id
  LEFT JOIN public.enquiries e ON e.id = COALESCE(p.enquiry_id, b.enquiry_id)
  WHERE p.created_at > now() - make_interval(days => p_days)
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_admin_payments(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_payments(INT) TO authenticated, service_role;

-- ============================================================
-- 5. THE CONSOLE'S WAY INTO THE DIARY
-- ============================================================
--
-- `reserve_slot` is on the Portal's absolute deny list, and correctly: it is
-- the concurrency-sensitive path, it takes a hold, and it exists to be called
-- by somebody standing in a checkout. The Portal's rule is that the safe
-- wrapper is allowed instead, and this is that wrapper.
--
-- The difference is not ceremony. When the owner books a job from the console
-- the customer is usually on the phone: there is no hold to place, no deposit
-- link to wait for, and no reason to leave the slot in `pending_payment` until
-- something times out. So this confirms immediately and says who did it.
CREATE OR REPLACE FUNCTION public.book_enquiry(
  p_enquiry_id UUID,
  p_service_id TEXT,
  p_starts_at  TIMESTAMPTZ,
  p_agreed_price_gbp NUMERIC DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enquiry public.enquiries%ROWTYPE;
  v_booking JSONB;
BEGIN
  SELECT * INTO v_enquiry FROM public.enquiries WHERE id = p_enquiry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_enquiry' USING ERRCODE = 'P0001';
  END IF;

  -- A job needs a price somebody stands behind. The catalogue's number is
  -- indicative by design (§20), so if nobody has quoted this and the caller has
  -- not supplied a figure, there is nothing to book against.
  IF COALESCE(p_agreed_price_gbp, v_enquiry.quoted_total_gbp) IS NULL THEN
    RAISE EXCEPTION 'quote_required_for_status' USING ERRCODE = 'P0001';
  END IF;

  v_booking := public.reserve_slot(
    p_service_id,
    p_starts_at,
    v_enquiry.customer_phone,
    split_part(v_enquiry.customer_name, ' ', 1),
    NULLIF(substr(v_enquiry.customer_name, length(split_part(v_enquiry.customer_name, ' ', 1)) + 2), ''),
    v_enquiry.customer_email,
    v_enquiry.postcode,
    p_enquiry_id,
    COALESCE(p_agreed_price_gbp, v_enquiry.quoted_total_gbp),
    v_enquiry.service_location,
    v_enquiry.registration,
    'portal'
  );

  -- Booked by a person who has just spoken to the customer: confirmed, no hold.
  UPDATE public.bookings
     SET status = 'confirmed',
         hold_expires_at = NULL,
         notes = COALESCE(p_notes, notes)
   WHERE id = (v_booking->>'id')::uuid
  RETURNING to_jsonb(bookings.*) INTO v_booking;

  UPDATE public.enquiries SET status = 'booked'
   WHERE id = p_enquiry_id AND status <> 'completed';

  RETURN v_booking;
END $$;

REVOKE ALL ON FUNCTION public.book_enquiry(UUID, TEXT, TIMESTAMPTZ, NUMERIC, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_enquiry(UUID, TEXT, TIMESTAMPTZ, NUMERIC, TEXT)
  TO authenticated, service_role;
