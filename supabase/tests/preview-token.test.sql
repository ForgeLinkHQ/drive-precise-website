-- The website preview: a token can be minted, and only a live one opens drafts.
--
-- This file exists because the function it tests reported as working for
-- weeks while it could not run at all. `create_preview_token()` pinned
-- `search_path = public` and called pgcrypto's `gen_random_bytes()`, which
-- Supabase installs into `extensions`. The harness had pgcrypto in `public`, so
-- it never noticed. It now installs it where Supabase does — the first
-- assertion below proves that, so a future bootstrap change cannot quietly
-- make the rest of this file meaningless.

BEGIN;

SELECT harness.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'gen_random_bytes' AND n.nspname = 'public'
  ),
  'pgcrypto is in extensions, not public — the harness is Supabase-shaped'
);

-- ── Minting ───────────────────────────────────────────────────────────────
SELECT harness.eq(
  length(public.create_preview_token(NULL)), 48,
  'a preview token can be minted, and is 24 random bytes as hex'
);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.preview_tokens), 1,
  'and it is recorded'
);
SELECT harness.ok(
  (SELECT expires_at > now() + interval '25 minutes' FROM public.preview_tokens),
  'for roughly half an hour'
);

-- ── Presenting it ─────────────────────────────────────────────────────────
SELECT harness.ok(
  public.token_is_valid((SELECT token FROM public.preview_tokens)),
  'the token the Portal was given is accepted'
);
SELECT harness.ok(
  NOT public.token_is_valid('not-a-token'),
  'a made-up token is refused'
);

INSERT INTO public.site_content (key, value, draft_value, label)
VALUES ('test.headline', 'Live copy', 'Draft copy', 'Test headline')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, draft_value = EXCLUDED.draft_value;

SELECT harness.eq(
  public.get_draft_site_content((SELECT token FROM public.preview_tokens)) ->> 'test.headline',
  'Draft copy',
  'a live token sees the draft'
);
SELECT harness.eq(
  public.get_draft_site_content('not-a-token') ->> 'test.headline',
  NULL::text,
  'no token, no drafts — the draft never reaches the public internet by accident'
);

-- ── Expiry is enforced by the clock, not by trust ─────────────────────────
UPDATE public.preview_tokens SET expires_at = now() - interval '1 second';
SELECT harness.ok(
  NOT public.token_is_valid((SELECT token FROM public.preview_tokens)),
  'an expired token is refused'
);
SELECT public.create_preview_token(NULL);
SELECT harness.eq(
  (SELECT count(*)::int FROM public.preview_tokens WHERE expires_at < now()), 0,
  'minting a new token sweeps the expired ones'
);

-- ── Who may mint ──────────────────────────────────────────────────────────
SELECT harness.ok(
  has_function_privilege('service_role', 'public.create_preview_token(uuid)', 'EXECUTE'),
  'the Portal can mint a token'
);
SELECT harness.ok(
  NOT has_function_privilege('anon', 'public.create_preview_token(uuid)', 'EXECUTE'),
  'the public website cannot'
);

ROLLBACK;
