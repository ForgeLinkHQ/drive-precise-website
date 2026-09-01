-- Everything the Portal reaches for, checked as privileges rather than as text.
--
-- The Portal talks to this database through proxy edge functions holding the
-- service-role key. A function that role cannot execute fails at runtime, and
-- the console page it powers renders empty behind a 403 in a network tab nobody
-- is watching.
--
-- Reading the migrations cannot answer this. `REVOKE ALL … FROM PUBLIC`, which
-- almost every function here opens with, does *not* remove service_role —
-- PUBLIC and service_role are different grantees, and Supabase's default
-- privileges have already granted the role EXECUTE on everything the migrations
-- create. So the presence or absence of a `GRANT … TO service_role` line proves
-- nothing either way. `has_function_privilege` proves it.

BEGIN;

-- ── The functions the automotive vertical names ───────────────────────────
--
-- Kept in step with `extraReadRpcs` and `extraWriteRpcs` in the Portal's
-- automotive vertical, plus the website-copy functions every trade gets. If
-- this list and that file disagree, one of them is wrong and this is the half
-- that can tell.
DO $$
DECLARE
  fn TEXT;
  sig TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    -- Website copy, shared with every trade.
    'get_site_content()',
    'pending_changes_count()',
    'publish_site_changes(uuid)',
    'discard_site_changes()',
    'create_preview_token(uuid)',
    -- The catalogue, minus the commercial columns.
    'get_admin_services()',
    'get_admin_packages()',
    -- The funnel and the only way to move an enquiry.
    'get_enquiry_pipeline(integer)',
    'update_enquiry_status(uuid,text,numeric,text,text,text)',
    -- Seasonal offers.
    'get_admin_promotions()',
    'promotion_diagnostics()',
    'upsert_promotion(uuid,text,numeric,text,text,text,text,date,date,boolean)',
    'set_promotion_active(uuid,boolean)',
    'delete_promotion(uuid)'
  ] LOOP
    sig := 'public.' || fn;
    PERFORM harness.ok(
      has_function_privilege('service_role', sig, 'EXECUTE'),
      'the Portal can execute ' || fn
    );
  END LOOP;
END
$$;

-- ── And the ones it must not be able to reach ─────────────────────────────
--
-- `anon` is the public website's key. These are the admin surfaces, and a
-- registration lookup rate check that would be pointless if the caller could
-- reset it.
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_admin_services()',
    'public.get_admin_packages()',
    'public.get_enquiry_pipeline(integer)',
    'public.update_enquiry_status(uuid,text,numeric,text,text,text)',
    'public.get_admin_promotions()',
    'public.upsert_promotion(uuid,text,numeric,text,text,text,text,date,date,boolean)',
    'public.set_promotion_active(uuid,boolean)',
    'public.delete_promotion(uuid)'
  ] LOOP
    PERFORM harness.ok(
      NOT has_function_privilege('anon', fn, 'EXECUTE'),
      'the public website cannot execute ' || fn
    );
  END LOOP;
END
$$;

-- ── §60, as a privilege rather than a promise ─────────────────────────────
--
-- The catalogue's commercial columns are the reason `services` is refused to
-- the Portal's table proxy. That refusal lives in the Portal's own code, so
-- what this side can assert is the other half: no anonymous read of the table
-- itself, and an admin function whose column list does not carry cost.
SELECT harness.ok(
  NOT has_table_privilege('anon', 'public.services', 'SELECT'),
  'anon cannot read the services table directly'
);

DO $$
DECLARE col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['parts_cost_gbp', 'consumables_cost_gbp', 'internal_notes'] LOOP
    PERFORM harness.ok(
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('get_admin_services', 'get_admin_promotions')
           AND column_name = col
      ),
      'no admin function returns ' || col
    );
  END LOOP;
END
$$;

-- ── Every definer function pins its search_path ───────────────────────────
--
-- A SECURITY DEFINER function without `SET search_path` runs whatever schema
-- the caller puts in front of it, which is the classic way a definer function
-- becomes a privilege escalation.
SELECT harness.eq(
  (SELECT count(*)::int
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
         WHERE c LIKE 'search_path=%'
      )),
  0,
  'every SECURITY DEFINER function pins search_path'
);

ROLLBACK;
