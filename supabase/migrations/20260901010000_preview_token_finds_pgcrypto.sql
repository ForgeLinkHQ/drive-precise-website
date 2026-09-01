-- The Portal's website preview has never been able to mint a token here.
--
-- `create_preview_token()` is SECURITY DEFINER with `SET search_path = public`,
-- and its first line calls `gen_random_bytes(24)`. That function is pgcrypto's,
-- and Supabase installs pgcrypto into the `extensions` schema rather than
-- `public`. A pinned search path that does not name `extensions` cannot see it,
-- so the call raises
--
--   function gen_random_bytes(integer) does not exist
--
-- the first time anyone presses Preview in the Portal. The proxy reports that
-- as a 400, and the Website page shows an empty panel with nothing to explain
-- it. `gen_random_uuid()` is unaffected — it is core PostgreSQL — which is why
-- every other function in this schema works and this one does not.
--
-- Pinning `public, extensions` keeps the definer function safe (both schemas
-- are owned by the project, neither is writable by callers) and lets it find
-- the extension where Supabase actually put it. A schema named on a search path
-- that does not exist is ignored, so this also applies cleanly on a database
-- where pgcrypto lives in `public`.
--
-- A new migration rather than an edit to 20260817000000: that file may already
-- have been applied to the live project, and a migration that changes after it
-- has run is a migration nobody can trust. `supabase/tests/preview-token.test.sql`
-- fails against the old definition and passes against this one, because the
-- harness now installs pgcrypto where Supabase does.
--
-- Same fix, same day, in char-beauty-app: both sites inherited the function
-- from the same draft/publish design.

CREATE OR REPLACE FUNCTION public.create_preview_token(p_actor UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_token TEXT := encode(gen_random_bytes(24), 'hex');
BEGIN
  DELETE FROM public.preview_tokens WHERE expires_at < now();

  INSERT INTO public.preview_tokens (token, expires_at, created_by)
  VALUES (v_token, now() + interval '30 minutes', p_actor);

  RETURN v_token;
END;
$$;

-- The grants from 20260817000000 are on the signature, not the body, and
-- survive CREATE OR REPLACE. Restated so this file is complete on its own.
REVOKE EXECUTE ON FUNCTION public.create_preview_token(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_preview_token(UUID) TO service_role;
