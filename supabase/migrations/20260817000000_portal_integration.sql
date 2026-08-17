-- Everything the ForgeLink Portal needs to run this business.
--
-- The site was built to be managed from the Portal — `vercel.json` has allowed
-- `frame-ancestors` from portal.forgelink.co since the first commit, and
-- `service-catalog.ts` already reads the catalogue from the database with the
-- shipped arrays underneath. What was missing was everything on this side of
-- that boundary: no editable copy, no alerts, and no admin-safe way to read a
-- catalogue row.
--
-- Four things happen here.
--
--   1. Editable website copy, with drafts and a publish step. This is what the
--      Portal's visual editor talks to. Copying the pattern from the first
--      client site rather than inventing a second one, because the Portal
--      speaks that contract already.
--
--   2. A preview token, so the Portal can render *unpublished* copy inside its
--      iframe without the site's public key ever being able to read a draft.
--
--   3. Owner alerts. Until now an enquiry landed in a table and nobody was
--      told — the shop window worked and the doorbell was never wired.
--
--   4. Admin-facing functions over the catalogue and the enquiry pipeline,
--      which name their columns so that §60 survives contact with the Portal.
--      That last point is the important one and is argued where it happens.

-- ============================================================
-- 1. WEBSITE COPY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_content (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL DEFAULT '',
  -- Pending edit awaiting publish. NULL means no pending change, which is what
  -- keeps get_site_content() unable to serve a draft by accident.
  draft_value   TEXT,
  kind          TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'longtext')),
  content_group TEXT NOT NULL DEFAULT 'general',
  label         TEXT NOT NULL,
  help          TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.site_content TO service_role;

-- Column-level rather than a table grant, and deliberately so. A table-level
-- GRANT SELECT automatically covers columns added later, which is how a
-- `draft_value` becomes world-readable through the anon key that ships in the
-- site's own bundle — every unpublished price, visible before anyone publishes
-- it. Naming the columns means a future column is private until someone says
-- otherwise.
GRANT SELECT (key, value, kind, content_group, label, help, sort_order, updated_at)
  ON public.site_content TO anon, authenticated;

CREATE POLICY "site_content_public_read" ON public.site_content
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP TRIGGER IF EXISTS site_content_touch ON public.site_content;
CREATE TRIGGER site_content_touch
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- One call for the whole site: cheaper than a query per page, and it lets the
-- front end hold a single cached object.
CREATE OR REPLACE FUNCTION public.get_site_content()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) FROM public.site_content;
$$;

REVOKE EXECUTE ON FUNCTION public.get_site_content() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_content() TO anon, authenticated, service_role;

-- The copy that is safe to let someone change without a deploy.
--
-- Deliberately excluded: anything the brief pins down. Prices live in the
-- catalogue with their own confirmation flag; the BMW disclaimer is a legal
-- statement rather than copy; and the symptom router's wording is a safety
-- property (§7) that should not be editable into a diagnosis.
INSERT INTO public.site_content (key, value, kind, content_group, label, help, sort_order) VALUES
  ('hero.eyebrow', 'Independent BMW specialists', 'text', 'Homepage',
   'Hero eyebrow', 'The small line above the main headline.', 10),
  ('hero.headline', 'Main-dealer knowledge. Without the main-dealer bill.', 'text', 'Homepage',
   'Hero headline', NULL, 20),
  ('hero.subheadline',
   'Mobile BMW servicing, brakes and diagnostics across Hampshire and Surrey. We come to you.',
   'longtext', 'Homepage', 'Hero sub-headline', NULL, 30),
  ('hero.cta', 'Build your quote', 'text', 'Homepage',
   'Main button text', 'What the big button on the homepage says.', 40),

  ('about.heading', 'Why Drive Precise', 'text', 'About',
   'About section heading', NULL, 10),
  ('about.body',
   'We are an independent specialist, not a franchise. That means main-dealer diagnostic knowledge, genuine or OE-matched parts, and a price you agree before anyone picks up a spanner.',
   'longtext', 'About', 'About section text', NULL, 20),

  ('areas.heading', 'Where we come to you', 'text', 'Service areas',
   'Service areas heading', NULL, 10),
  ('areas.body',
   'We cover Hampshire and Surrey, working from your driveway, your office car park, or wherever the car happens to be.',
   'longtext', 'Service areas', 'Service areas description',
   'The list of towns is generated from the service area data, not from here.', 20),

  ('quote.reassurance',
   'A quote request is free and never binding. We confirm the price with you before anything is booked.',
   'longtext', 'Quote builder', 'Reassurance under the quote form',
   'Shown at the last step. Keep it plain — this is the line that stops people hesitating.', 10),

  ('contact.phone_label', 'Call or WhatsApp', 'text', 'Contact',
   'Phone label', NULL, 10),
  ('contact.hours', 'Mon–Sat, 8am–6pm', 'text', 'Contact',
   'Contact hours (display only)', 'What visitors read. It does not control anything.', 20),
  ('contact.email', 'hello@driveprecise.co.uk', 'text', 'Contact',
   'Contact email', NULL, 30),

  ('footer.blurb',
   'Independent mobile BMW specialists covering Hampshire and Surrey. Servicing, brakes, suspension, repairs and pre-purchase checks.',
   'longtext', 'Footer', 'Footer description', NULL, 10)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. PUBLISH LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.publish_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by   UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  content_fields INT NOT NULL DEFAULT 0,
  detail         JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.publish_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.publish_log TO service_role;

CREATE INDEX IF NOT EXISTS publish_log_published_at_idx
  ON public.publish_log (published_at DESC);

-- ============================================================
-- 3. DRAFT → PREVIEW → PUBLISH
-- ============================================================
--
-- There is no service_drafts sidecar here, unlike the first client site. Its
-- catalogue feeds a live booking engine that reads services on every
-- availability check, so edits had to be staged. Nothing on this site books
-- against the catalogue yet — the quote builder reads it and a human prices the
-- job afterwards — so catalogue edits apply directly and only copy is staged.

CREATE OR REPLACE FUNCTION public.pending_changes_count()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'content', (
      SELECT count(*) FROM public.site_content
       WHERE draft_value IS NOT NULL AND draft_value IS DISTINCT FROM value
    ),
    -- Named and always zero: the Portal's publish bar reads both keys, and a
    -- missing one renders as "undefined changes".
    'services', 0
  );
$$;

CREATE OR REPLACE FUNCTION public.publish_site_changes(p_actor UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_content INT := 0;
  v_log_id  UUID;
BEGIN
  WITH promoted AS (
    UPDATE public.site_content
       SET value = draft_value, draft_value = NULL, updated_by = p_actor
     WHERE draft_value IS NOT NULL AND draft_value IS DISTINCT FROM value
    RETURNING 1
  )
  SELECT count(*) INTO v_content FROM promoted;

  -- An edit that was typed and then typed back to its original value is not a
  -- change, but it is still a pending draft. Clear those too, or the publish
  -- bar keeps insisting there is something to publish.
  UPDATE public.site_content SET draft_value = NULL WHERE draft_value IS NOT NULL;

  INSERT INTO public.publish_log (published_by, content_fields)
  VALUES (p_actor, v_content)
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'published', TRUE,
    'content_fields', v_content,
    'service_fields', 0,
    'log_id', v_log_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_site_changes()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_content INT := 0;
BEGIN
  WITH cleared AS (
    UPDATE public.site_content SET draft_value = NULL
     WHERE draft_value IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_content FROM cleared;

  RETURN jsonb_build_object(
    'discarded', TRUE, 'content_fields', v_content, 'service_fields', 0
  );
END;
$$;

-- Preview renders the real site from draft values, which means the site's anon
-- key has to reach them somehow. Granting anon a look at draft_value would put
-- unpublished copy on the public internet, so the Portal mints a short-lived
-- token instead and the site presents it. No token, no drafts.
CREATE TABLE IF NOT EXISTS public.preview_tokens (
  token      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.preview_tokens ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.preview_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.create_preview_token(p_actor UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token TEXT := encode(gen_random_bytes(24), 'hex');
BEGIN
  DELETE FROM public.preview_tokens WHERE expires_at < now();

  INSERT INTO public.preview_tokens (token, expires_at, created_by)
  VALUES (v_token, now() + interval '30 minutes', p_actor);

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.token_is_valid(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.preview_tokens
     WHERE token = p_token AND expires_at > now()
  );
$$;

-- Draft copy, readable only by presenting a live token.
CREATE OR REPLACE FUNCTION public.get_draft_site_content(p_token TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.token_is_valid(p_token)
      THEN COALESCE(
        jsonb_object_agg(key, COALESCE(draft_value, value)), '{}'::jsonb)
    ELSE '{}'::jsonb
  END
  FROM public.site_content;
$$;

REVOKE EXECUTE ON FUNCTION public.create_preview_token(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_preview_token(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.publish_site_changes(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_site_changes(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.discard_site_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_site_changes() TO service_role;

REVOKE EXECUTE ON FUNCTION public.pending_changes_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_changes_count() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_draft_site_content(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_draft_site_content(TEXT) TO anon, authenticated, service_role;

-- ============================================================
-- 4. OWNER ALERTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.owner_alert_settings (
  id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- A new quote request came in. The one that actually matters.
  on_new_enquiry      BOOLEAN NOT NULL DEFAULT TRUE,
  -- A trade account applied.
  on_trade_enquiry    BOOLEAN NOT NULL DEFAULT TRUE,
  -- A customer accepted a quote. The moment money becomes likely.
  on_quote_accepted   BOOLEAN NOT NULL DEFAULT TRUE,
  -- Nothing has been picked up in a day. The quiet failure that costs work.
  on_stale_enquiry    BOOLEAN NOT NULL DEFAULT TRUE,
  -- Where alerts go. NULL falls back to the owner's login address.
  notify_email        TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_alert_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.owner_alert_settings TO service_role;

INSERT INTO public.owner_alert_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS owner_alert_settings_touch ON public.owner_alert_settings;
CREATE TRIGGER owner_alert_settings_touch
  BEFORE UPDATE ON public.owner_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 5. THE CATALOGUE, FOR ADMIN EYES
-- ============================================================
--
-- This function exists because of how the Portal reaches this database.
--
-- The Portal holds a service-role key, which bypasses row-level security
-- entirely, and its table proxy selects every column when a page does not name
-- them. So the careful work in §60 — `toPublicService()` stripping the cost
-- fields, `get_public_services()` naming its columns, no policy admitting anon
-- to the table — protects the public site and would have been bypassed
-- completely the first time a Portal page read `services`.
--
-- The fix is not to make the Portal careful. It is to make the careless case
-- correct: `services` is refused to the Portal outright, and this function is
-- the only way in. It names its columns, so a column added later is private
-- until someone deliberately adds it here.
--
-- parts_cost_gbp, consumables_cost_gbp, labour_allocation_mins, travel_minutes
-- and internal_notes are absent on purpose. Portal org membership includes
-- `staff` and `readonly` roles, and margin is not staff information. If a
-- margin view is wanted later it should be a separate, owner-gated function —
-- a deliberate second decision, not a column quietly appended to this list.
CREATE OR REPLACE FUNCTION public.get_admin_services()
RETURNS TABLE (
  id                   TEXT,
  name                 TEXT,
  category             TEXT,
  short_description    TEXT,
  description          TEXT,
  includes             JSONB,
  pricing              TEXT,
  price_gbp            NUMERIC,
  price_suffix         TEXT,
  price_confirmed      BOOLEAN,
  compare_price_gbp    NUMERIC,
  duration_minutes     INTEGER,
  mobile               TEXT,
  workshop_recommended BOOLEAN,
  collection_available BOOLEAN,
  requires_parts_quote BOOLEAN,
  customer_type        TEXT,
  add_on_only          BOOLEAN,
  featured             BOOLEAN,
  sort_order           INTEGER,
  is_active            BOOLEAN,
  inactive_reason      TEXT,
  updated_at           TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.id, s.name, s.category, s.short_description, s.description, s.includes,
    s.pricing, s.price_gbp, s.price_suffix, s.price_confirmed,
    s.compare_price_gbp, s.duration_minutes, s.mobile, s.workshop_recommended,
    s.collection_available, s.requires_parts_quote, s.customer_type,
    s.add_on_only, s.featured, s.sort_order, s.is_active, s.inactive_reason,
    s.updated_at
  FROM public.services s
  ORDER BY s.category, s.sort_order, s.name;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_packages()
RETURNS TABLE (
  id                TEXT,
  name              TEXT,
  short_description TEXT,
  description       TEXT,
  includes          JSONB,
  also_includes     JSONB,
  pricing           TEXT,
  price_gbp         NUMERIC,
  price_confirmed   BOOLEAN,
  duration_minutes  INTEGER,
  customer_type     TEXT,
  featured          BOOLEAN,
  sort_order        INTEGER,
  is_active         BOOLEAN,
  updated_at        TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.name, p.short_description, p.description, p.includes,
    p.also_includes, p.pricing, p.price_gbp, p.price_confirmed,
    p.duration_minutes, p.customer_type, p.featured, p.sort_order,
    p.is_active, p.updated_at
  FROM public.service_packages p
  ORDER BY p.sort_order, p.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_services() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_services() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_admin_packages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_packages() TO authenticated, service_role;

-- ============================================================
-- 6. THE PIPELINE
-- ============================================================
--
-- Counts by status, plus the number this business does not currently have and
-- most needs: the gap between what the website indicated and what was actually
-- quoted once someone had seen the car. §41 asks for exactly that comparison,
-- and the columns to answer it have been collected since launch.
CREATE OR REPLACE FUNCTION public.get_enquiry_pipeline(p_days INT DEFAULT 90)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH window_enquiries AS (
    SELECT * FROM public.enquiries
     WHERE created_at >= now() - make_interval(days => GREATEST(p_days, 1))
  )
  SELECT jsonb_build_object(
    'days', GREATEST(p_days, 1),
    'total', (SELECT count(*) FROM window_enquiries),
    'by_status', COALESCE((
      SELECT jsonb_object_agg(status, n)
        FROM (SELECT status, count(*) AS n FROM window_enquiries GROUP BY status) t
    ), '{}'::jsonb),
    -- Averages over the rows that actually carry each figure. A quote that was
    -- never given is not a zero, and averaging it as one would understate every
    -- job on the board.
    --
    -- `indicative_total_gbp` is NOT NULL DEFAULT 0, so the filter here is `> 0`
    -- rather than a null check: an enquiry for quote-only work carries no
    -- indicative figure at all, and it arrives as zero rather than as nothing.
    'avg_indicative_gbp', (
      SELECT round(avg(indicative_total_gbp)::numeric, 2)
        FROM window_enquiries WHERE indicative_total_gbp > 0
    ),
    'avg_quoted_gbp', (
      SELECT round(avg(quoted_total_gbp)::numeric, 2)
        FROM window_enquiries WHERE quoted_total_gbp IS NOT NULL
    ),
    'quoted_count', (
      SELECT count(*) FROM window_enquiries WHERE quoted_total_gbp IS NOT NULL
    ),
    -- Median hours from arrival to first contact. The single number that says
    -- whether this business is answering its enquiries.
    'median_hours_to_contact', (
      SELECT round(
        (percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (contacted_at - created_at)) / 3600.0
        ))::numeric, 1)
        FROM window_enquiries WHERE contacted_at IS NOT NULL
    ),
    'awaiting_action', (
      SELECT count(*) FROM public.enquiries
       WHERE status IN ('new', 'contacted', 'awaiting_information')
    ),
    'trade_total', (
      SELECT count(*) FROM public.trade_enquiries
       WHERE created_at >= now() - make_interval(days => GREATEST(p_days, 1))
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_enquiry_pipeline(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_enquiry_pipeline(INT) TO authenticated, service_role;

-- Move an enquiry along, and record the money in the same statement.
--
-- A plain table update through the Portal's write proxy would work, and would
-- let a status and its quoted figure drift apart — a row marked `quoted` with
-- no quote on it, which then averages into nothing and reads as a bug in the
-- report rather than a gap in the data. This refuses that combination.
--
-- The lifecycle timestamps are stamped by the existing enquiries trigger, so
-- they cannot disagree with the status that produced them.
CREATE OR REPLACE FUNCTION public.update_enquiry_status(
  p_enquiry_id UUID,
  p_status     TEXT,
  p_quoted_total_gbp NUMERIC DEFAULT NULL,
  p_lost_reason      TEXT DEFAULT NULL,
  p_admin_notes      TEXT DEFAULT NULL,
  p_techman_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.enquiries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.enquiries WHERE id = p_enquiry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_enquiry' USING ERRCODE = 'P0001';
  END IF;

  -- Reaching a quoted state means there is a quote. Either it arrives with this
  -- call or it is already on the row.
  IF p_status IN ('quoted', 'quote_accepted', 'booking_pending', 'booked', 'completed')
     AND COALESCE(p_quoted_total_gbp, v_row.quoted_total_gbp) IS NULL THEN
    RAISE EXCEPTION 'quote_required_for_status' USING ERRCODE = 'P0001';
  END IF;

  -- A lost enquiry without a reason is a row nobody can learn anything from.
  IF p_status = 'lost' AND COALESCE(p_lost_reason, v_row.lost_reason) IS NULL THEN
    RAISE EXCEPTION 'lost_reason_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.enquiries
     SET status            = p_status,
         quoted_total_gbp  = COALESCE(p_quoted_total_gbp, quoted_total_gbp),
         lost_reason       = COALESCE(p_lost_reason, lost_reason),
         admin_notes       = COALESCE(p_admin_notes, admin_notes),
         techman_reference = COALESCE(p_techman_reference, techman_reference)
   WHERE id = p_enquiry_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'quoted_total_gbp', v_row.quoted_total_gbp,
    'contacted_at', v_row.contacted_at,
    'quoted_at', v_row.quoted_at,
    'booked_at', v_row.booked_at,
    'completed_at', v_row.completed_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_enquiry_status(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_enquiry_status(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT)
  TO authenticated, service_role;
