-- The partner network and referral ledger (§18, §19, §44).
--
-- Entirely back-office. Nothing in this migration is readable without a role,
-- and there is no public function over it — §18 is explicit that referral
-- commissions are not a public selling point, so the commercial side of a
-- referral must not be reachable from the browser at all.

CREATE TABLE IF NOT EXISTS public.partners (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name     TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN (
                      'tyres', 'alignment', 'mot', 'wheel-refurb', 'bodywork',
                      'paint', 'glass', 'adas', 'detailing', 'other'
                    )),
  contact_name      TEXT,
  phone             TEXT,
  email             TEXT,
  location          TEXT,
  postcode          TEXT,
  services          JSONB NOT NULL DEFAULT '[]'::jsonb,
  /* Free text on purpose: "trade rate", "20% off list", "reciprocal" — these
     arrangements are negotiated in conversation and do not fit an enum. */
  trade_arrangement TEXT,
  commission_type   TEXT CHECK (commission_type IS NULL OR commission_type IN
                      ('percentage', 'fixed', 'none')),
  commission_value  NUMERIC(10, 2),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  internal_notes    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS partners_touch ON public.partners;
CREATE TRIGGER partners_touch BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID REFERENCES public.partners (id) ON DELETE SET NULL,
  enquiry_id        UUID REFERENCES public.enquiries (id) ON DELETE SET NULL,
  /* Denormalised so a referral survives its enquiry being deleted under a
     data-erasure request — the commercial record of the referral is Drive
     Precise's own, the customer's identity is not. */
  registration      TEXT,
  service_category  TEXT NOT NULL,
  service_note      TEXT,
  status            TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN (
                      'suggested', 'customer_interested', 'referred', 'booked',
                      'completed', 'commission_due', 'commission_received'
                    )),
  referred_at       DATE,
  customer_spend_gbp NUMERIC(10, 2),
  commission_gbp    NUMERIC(10, 2),
  internal_notes    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_referrals_partner_idx
  ON public.partner_referrals (partner_id, status);
CREATE INDEX IF NOT EXISTS partner_referrals_enquiry_idx
  ON public.partner_referrals (enquiry_id);

DROP TRIGGER IF EXISTS partner_referrals_touch ON public.partner_referrals;
CREATE TRIGGER partner_referrals_touch BEFORE UPDATE ON public.partner_referrals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partners FROM anon;
REVOKE ALL ON public.partner_referrals FROM anon;

CREATE POLICY "admin_manage_partners" ON public.partners
  FOR ALL TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

CREATE POLICY "admin_manage_referrals" ON public.partner_referrals
  FOR ALL TO authenticated
  USING (public.has_admin_role())
  WITH CHECK (public.has_admin_role());

-- Referral revenue by partner (§41). A view rather than a report built in the
-- app, so the numbers are the same wherever they are read from.
--
-- security_invoker matters here. A view defaults to running with its owner's
-- privileges, which would bypass the RLS above entirely — every signed-in user,
-- including a customer once accounts exist, would be able to read the whole
-- commission ledger. Running as the invoker means the admin policies apply and
-- a non-admin sees no rows.
CREATE OR REPLACE VIEW public.partner_referral_summary
WITH (security_invoker = true) AS
  SELECT
    p.id AS partner_id,
    p.business_name,
    p.category,
    count(r.id) AS referrals,
    count(r.id) FILTER (WHERE r.status IN ('booked', 'completed', 'commission_due',
                                           'commission_received')) AS converted,
    coalesce(sum(r.customer_spend_gbp), 0) AS customer_spend_gbp,
    coalesce(sum(r.commission_gbp) FILTER (WHERE r.status = 'commission_received'), 0)
      AS commission_received_gbp,
    coalesce(sum(r.commission_gbp) FILTER (WHERE r.status = 'commission_due'), 0)
      AS commission_outstanding_gbp
  FROM public.partners p
  LEFT JOIN public.partner_referrals r ON r.partner_id = p.id
  GROUP BY p.id, p.business_name, p.category;

REVOKE ALL ON public.partner_referral_summary FROM anon, authenticated;
GRANT SELECT ON public.partner_referral_summary TO authenticated;
