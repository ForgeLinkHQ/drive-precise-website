-- The partner network becomes public (§18, §19).
--
-- The `partners` and `partner_referrals` tables have existed since the schema
-- was written, holding the commercial side of the arrangement: trade terms,
-- commission type and value, and a referral lifecycle from "suggested" to
-- "commission received". All of it internal. This migration adds the customer
-- facing half without letting any of that leak.
--
-- Three things happen here.
--
--   1. A `performance` category, for parts supply and tuning. Every other
--      category is work Drive Precise sends away; this one is the other half
--      of a job it already does, since the modifications catalogue sells
--      fitting for customer-supplied parts.
--
--   2. Columns that only exist to be published: a website, a one-line summary,
--      and an explicit consent flag.
--
--   3. `get_public_partners()`, which is the only way partner data reaches a
--      browser, and whose column list is the contract.

-- ── Category ──────────────────────────────────────────────────────────────
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_category_check;
ALTER TABLE public.partners ADD CONSTRAINT partners_category_check
  CHECK (category IN (
    'tyres', 'alignment', 'mot', 'wheel-refurb', 'bodywork',
    'paint', 'glass', 'adas', 'detailing', 'performance', 'other'
  ));

-- ── Publishable columns ───────────────────────────────────────────────────
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS website        TEXT,
  ADD COLUMN IF NOT EXISTS public_summary TEXT;

/*
 * Consent to being named, separate from being usable.
 *
 * This is the important one, and it defaults to FALSE on purpose.
 *
 * `is_active` means "we send work here". It does NOT mean "this business has
 * agreed to appear on our website", and conflating the two is how a site ends
 * up claiming a relationship its supposed partner never signed off. Naming a
 * business — a trademark holder especially — before they have said yes is a
 * false claim of affiliation, and it is the kind of mistake that arrives as a
 * letter rather than a bug report.
 *
 * Defaulting to FALSE means adding a partner is never accidentally an act of
 * publishing them. Someone has to tick a box, which is exactly the moment the
 * question "have they actually agreed?" gets asked.
 */
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS is_publicly_listed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.partners.is_publicly_listed IS
  'Has this business agreed to be named on the website? Defaults false. Never set it without their agreement.';
COMMENT ON COLUMN public.partners.public_summary IS
  'One line shown on /partners. Public. Never put commercial terms here.';

CREATE INDEX IF NOT EXISTS partners_public_idx
  ON public.partners (category)
  WHERE is_active AND is_publicly_listed;

-- ── The public read path ──────────────────────────────────────────────────
/**
 * Partners, as a browser may see them.
 *
 * A SECURITY DEFINER function rather than a SELECT policy, for the same reason
 * the service catalogue uses one: the table holds columns that must never
 * leave the server. `commission_type`, `commission_value`, `trade_arrangement`
 * and `internal_notes` are Drive Precise's negotiated position with each
 * business. A partner opening the network tab and reading what everyone else
 * agreed to would end the network.
 *
 * A row-level policy cannot express "these columns but not those". This can,
 * and the column list below is the whole contract. Nothing is selected with a
 * wildcard anywhere in this path.
 *
 * Two conditions to appear: the partner is active, and they have agreed to be
 * named.
 */
CREATE OR REPLACE FUNCTION public.get_public_partners()
RETURNS TABLE (
  business_name  TEXT,
  category       TEXT,
  location       TEXT,
  website        TEXT,
  public_summary TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.business_name,
    p.category,
    p.location,
    p.website,
    p.public_summary
  FROM public.partners p
  WHERE p.is_active
    AND p.is_publicly_listed
  ORDER BY p.category, p.business_name;
$$;

REVOKE ALL ON FUNCTION public.get_public_partners() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_partners() TO anon, authenticated;
