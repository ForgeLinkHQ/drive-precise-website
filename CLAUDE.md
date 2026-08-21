# Drive Precise

## What This Is

The customer-facing website and quote-building system for **Drive Precise Ltd**, an
independent mobile BMW specialist operating in Hampshire and Surrey.

It is not a garage website with a booking form. It is a **service checkout**: the
customer identifies their car, builds a basket of work, sees indicative pricing as
they go, and produces a structured enquiry that Drive Precise turns into a firm
vehicle-specific quote over WhatsApp.

## The Law

**Read [FORGELINK_LAW.md](./FORGELINK_LAW.md) before writing code in this repo.**

It is the platform constitution, byte-identical in every ForgeLink repository,
and it is enforced by `src/test/core-drift.test.ts` rather than by memory.

The short version:

- **Function is shared, semantics are local.** If another client of the same
  trade would not need it changed, it is function and belongs in core.
- **Core files are synced, never edited here.** Change them in
  `forgelink-portal/core`, publish, then `node scripts/core-sync.mjs`.
- **A fix that is function is made in core, or it is not finished.** Fixing it
  only here is how two clients stop being one platform.
- **Client identity never lives in code.** It lives in `site_content` or in
  environment configuration.

If you cannot unify something today, register it in `forgelink.core.json` under
`duplication` with a status and an owner. The build accepts that. It does not
accept an unrecorded divergence.

## The Ecosystem

- **forge-blaze-hq** — Brandon's internal OS, multi-tenant SaaS.
- **forgelink-portal** — Agency CMS at portal.forgelink.co.
- **char-beauty-app** — The first client site; the pattern this project follows.
- **drive-precise-website** (this repo) — Client site for Drive Precise Ltd.

Conventions are deliberately shared with `char-beauty-app` — same stack, same
route and library layout, same testing approach — so both client sites stay
maintainable by the same people. This repo is otherwise fully independent: its
own Supabase project, its own Vercel deployment, no shared data.

## Stack

React 19 · TanStack Start (SSR) + TanStack Router · Vite 8 · Tailwind 4 ·
Supabase (own project) · Vercel (Nitro preset) · Vitest.

**Nothing on the public site is payable.** A quote request is free and
non-binding, and the price is confirmed by a human before anything is booked —
that rule has not moved. What sits after it now has: once a person has quoted
the job and the customer has accepted, a deposit can be taken to hold a date.
That is the `paymentPoint: "on_quote_accept"` the automotive vertical has always
declared. There is still no basket, no checkout and no price a visitor can pay
without a human having looked at their car first.

## The Rules That Shape The Code

These come from the client brief and are enforced by tests, not just documented.

1. **Three pricing types, never blurred** (§20). `fixed` is a promise. `from` is a
   starting point with a mandatory caveat. `quote` renders no number at all. A
   `quote` service has no `priceGbp` field — not zero, absent — so no total can
   accidentally include it.
2. **Never fabricate a saving** (§25). `packageUpgrades()` returns nothing unless
   it can do the arithmetic honestly with real prices on both sides.
3. **The basket total is never "Total"** (§23). `totalLabel()` has no branch that
   produces that word alone.
4. **No diagnostics** (§46). Drive Precise does not own the equipment. The services
   exist in the data, are `active: false`, and `diagnostics` is absent from
   `CATEGORY_ORDER` — which is the single gate keeping them off every page, search
   result and sitemap. Do not add "coming soon" wording.
5. **No air-conditioning regas** (§47). The cabin hygiene treatment is a hygiene
   treatment and says so.
6. **Never invent vehicle details** (§21). There is no registration lookup yet.
   `describeVehicle()` returns "Model to confirm" and the fields for a future
   provider are all optional.
7. **Internal cost data never reaches a browser** (§60). `toPublicService()` strips
   it, `get_public_services()` names its columns, and no RLS policy admits anon to
   the `services` table itself.
8. **Not affiliated with BMW.** BMW is the specialism, not the employer. The
   footer says so on every page.

## Managed From The Portal

This site is administered from **ForgeLink Portal** (`automotive` vertical), not
from its own `/admin`, which is a break-glass route. The Portal reaches this
database through its proxy edge functions using the service role key.

That key **bypasses RLS entirely**, and the Portal's table proxy selects every
column when a page does not name them. So §60 cannot be enforced by RLS alone:

- `services` is **refused** to the Portal outright (see the automotive vertical's
  `deniedTables`). It carries `parts_cost_gbp`, `consumables_cost_gbp` and
  `internal_notes`.
- `get_admin_services()` / `get_admin_packages()` name their columns and are the
  only way the Portal reads the catalogue. **Do not add a cost column to those
  return types** — Portal org membership includes `staff` and `readonly`, and
  margin is not staff information. A margin view should be a separate,
  owner-gated function.

Other Portal-facing surfaces, all added in `20260817000000_portal_integration.sql`:

- `site_content` + `publish_log` + `preview_tokens` — the visual editor. Copy is
  drafted, previewed through a 30-minute token, then published in one go.
  `vercel.json` has allowed `frame-ancestors` from the Portal since launch.
- `get_enquiry_pipeline()` — the funnel, including indicative vs quoted (§41).
- `update_enquiry_status()` — the **only** way the Portal moves an enquiry. It
  refuses a quoted status with no quote and a lost status with no reason, so the
  report can never be asked to average a number that was never given.

## Owner Alerts

`20260817010000_owner_alert_dispatch.sql`. Before this, an enquiry landed in a
table and nobody was told.

Triggers **queue** rather than send: a customer's INSERT must never fail because
an email provider is unreachable. `dispatch_owner_alerts()` sweeps the queue and
calls the `notify-owner` edge function. Alerts can be up to a minute late, which
is the right trade for never losing an enquiry.

After deploying, schedule via pg_cron and set the function secrets
(`RESEND_API_KEY`, `OWNER_EMAIL` or `notify_email` in the Portal, `SITE_URL`,
`PORTAL_URL`) — the cron lines are in the migration header.

## Key Files

- `src/lib/services.ts` — the catalogue. Types, seed data, pricing presentation.
- `src/lib/packages.ts` — packages and the upgrade arithmetic.
- `src/lib/addons.ts` — contextual add-on engine and partner suggestions.
- `src/lib/basket.ts` — the quote draft store, persistence and totals.
- `src/lib/enquiry.ts` — validation, the immutable snapshot, submission.
- `src/lib/whatsapp.ts` — the prefilled handoff message.
- `src/lib/service-catalog.ts` — database overlay with the shipped catalogue underneath.
- `src/routes/quote.tsx` — the seven-step builder.
- `supabase/migrations/` — schema, RLS and the definer functions that are the only
  public read and write paths.
- `supabase/functions/notify-owner/` — the doorbell. Service-role only.
- `supabase/functions/_shared/email-template.ts` — brand tokens + table-based
  email layout, forked from the first client site. A new site is a palette swap.

## Prices Are Placeholders

Every seeded price carries `priceConfirmed: false`. `UNCONFIRMED_PRICE_COUNT` is
asserted in the test suite and surfaced in the admin dashboard. **Do not remove that
assertion to make a test pass** — it exists so a real price becomes a deliberate
decision rather than a drift.

## Commands

```bash
npm run dev        # local dev server
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint + prettier
npm run build      # vite build -> .vercel/output
npm run test:all   # typecheck + test + build
```

The route tree (`src/routeTree.gen.ts`) is generated by the router plugin during
dev/build. A fresh clone will fail `typecheck` until `npm run build` has run once.
