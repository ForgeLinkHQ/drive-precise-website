-- The parts of a Supabase project that exist before any migration runs.
--
-- Migrations are written against a live Supabase database and quietly assume a
-- great deal of it: three roles, an `auth` schema with a `uid()` that reads the
-- request's JWT, pgcrypto in the `extensions` schema, and the `pg_net` and
-- `pg_cron` extensions the alert dispatchers call. A plain PostgreSQL 16 has
-- none of that, so this file is what makes `psql -f` on the real migration
-- files a meaningful test rather than a syntax check.
--
-- `net` and `cron` are stubbed rather than installed. Both are called from
-- inside plpgsql bodies, which PostgreSQL does not resolve until execution, so
-- a stub is enough to prove the migration applies — and a stub that returns a
-- fixed id is honest about the fact that this harness does not test delivery.

-- Roles are cluster-wide rather than per-database, so this has to tolerate a
-- cluster that has already hosted a run. BYPASSRLS on `service_role` mirrors
-- the real thing, and is the whole reason §60 cannot be left to row-level
-- security alone.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- pgcrypto goes where Supabase puts it: the `extensions` schema, which is on
-- the database's default search path and is NOT `public`. That placement is
-- load-bearing for this harness. A SECURITY DEFINER function that pins
-- `search_path = public` and calls `gen_random_bytes()` fails on Supabase with
-- "function does not exist" — and with pgcrypto installed into `public` here,
-- the harness reported that function as working when it never had. See
-- 20260901010000_preview_token_finds_pgcrypto.sql.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
-- New sessions — every migration and every test file below runs in one — see
-- the same default path a Supabase project does.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = "$user", public, extensions',
                 current_database());
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT
);

-- Reads the same setting PostgREST sets, so a test can act as a signed-in user
-- with `SET request.jwt.claim.sub`.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION net.http_post(
  url TEXT,
  body JSONB DEFAULT '{}',
  params JSONB DEFAULT '{}',
  headers JSONB DEFAULT '{}',
  timeout_milliseconds INT DEFAULT 5000
) RETURNS BIGINT LANGUAGE sql AS $$ SELECT 1::bigint $$;

CREATE SCHEMA IF NOT EXISTS cron;
CREATE OR REPLACE FUNCTION cron.schedule(job_name TEXT, schedule TEXT, command TEXT)
  RETURNS BIGINT LANGUAGE sql AS $$ SELECT 1::bigint $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, service_role;

-- ── The assertion helper ──────────────────────────────────────────────────
--
-- Deliberately tiny. A failed assertion raises, `ON_ERROR_STOP=1` makes psql
-- exit non-zero, and the runner turns that into a failed build.
CREATE SCHEMA IF NOT EXISTS harness;

CREATE OR REPLACE FUNCTION harness.ok(condition BOOLEAN, what TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS NOT TRUE THEN
    RAISE EXCEPTION 'FAILED: %', what;
  END IF;
  RAISE NOTICE '  ok  %', what;
END;
$$;

CREATE OR REPLACE FUNCTION harness.eq(got ANYELEMENT, want ANYELEMENT, what TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAILED: % — got %, wanted %', what, got, want;
  END IF;
  RAISE NOTICE '  ok  %', what;
END;
$$;

/**
 * Assert that a statement raises. Used for the rules that are supposed to be
 * unenforceable-around: a lost enquiry with no reason, a quote-only service
 * with a price, and so on.
 */
CREATE OR REPLACE FUNCTION harness.raises(statement TEXT, what TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '  ok  % (%)', what, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAILED: % — the statement was accepted', what;
END;
$$;
