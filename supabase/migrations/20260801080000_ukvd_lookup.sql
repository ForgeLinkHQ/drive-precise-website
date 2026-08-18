-- UK Vehicle Data becomes the lookup provider (§21).
--
-- DVLA is not issuing new API registrations at the moment, and UKVD returns
-- the one field DVLA never did: the model. That is the whole reason for the
-- change. A customer who types their registration and sees "2015 BMW 320d
-- M Sport" believes the rest of the site; one who sees "2015 BMW" wonders
-- what else it does not know.
--
-- DVLA stays configured as a fallback. It is free and official, and degrading
-- to make and year is much better than degrading to nothing.
--
-- The cache is provider-agnostic on purpose: both providers write the same
-- columns and `source` records which one answered, so a cached row read back
-- months later does not need to know where it came from.

ALTER TABLE public.vehicle_lookups
  ADD COLUMN IF NOT EXISTS derivative            TEXT,
  ADD COLUMN IF NOT EXISTS engine_code           TEXT,
  ADD COLUMN IF NOT EXISTS gearbox               TEXT,
  ADD COLUMN IF NOT EXISTS body_style            TEXT,
  ADD COLUMN IF NOT EXISTS first_registered_date DATE,
  ADD COLUMN IF NOT EXISTS image_url             TEXT;

COMMENT ON COLUMN public.vehicle_lookups.model IS
  'Supplied by UKVD. Null from DVLA VES, which has no model field. Never inferred from engine capacity (§21).';
COMMENT ON COLUMN public.vehicle_lookups.image_url IS
  'Stock image for the model, not a photograph of this car. Decorative only.';

-- `source` now has a third legitimate value.
ALTER TABLE public.vehicle_lookups DROP CONSTRAINT IF EXISTS vehicle_lookups_source_check;
ALTER TABLE public.vehicle_lookups ADD CONSTRAINT vehicle_lookups_source_check
  CHECK (source IN ('ukvd', 'dvla-ves', 'manual'));
