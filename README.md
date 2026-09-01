# Drive Precise

The website and quote-building system for **Drive Precise Ltd** — an independent
mobile BMW specialist covering Hampshire and Surrey.

Not a garage website with a booking form. A **service checkout**: the customer
identifies their car, builds a basket of work, sees indicative pricing while they
build it, and produces a structured enquiry that becomes a firm vehicle-specific
quote on WhatsApp.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in the Supabase values
npm run build                  # generates src/routeTree.gen.ts
npm run dev                    # http://localhost:3000
```

`npm run build` before `typecheck` on a fresh clone is not optional: the TanStack
Router plugin generates `src/routeTree.gen.ts` during the build and every route
file resolves its types against it.

| Command              | What it does                                                            |
| -------------------- | ----------------------------------------------------------------------- |
| `npm run dev`        | Dev server with HMR                                                     |
| `npm test`           | Vitest                                                                  |
| `npm run typecheck`  | `tsc --noEmit`                                                          |
| `npm run lint`       | ESLint + Prettier                                                       |
| `npm run build`      | Production build to `.vercel/output`                                    |
| `npm run test:smoke` | Real-browser smoke test of every route + the quote journey              |
| `npm run test:sql`   | Apply every migration to a throwaway Postgres and run `supabase/tests/` |

---

## Deploying

### Supabase

1. Create a Supabase project for Drive Precise. It gets its **own** project — it
   does not share one with C. Beauty or the Portal.
2. Apply the migrations, oldest first:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. Create the first admin user (Studio → Authentication → Add user; public
   sign-up is disabled in `config.toml` by design), then grant the role:
   ```sql
   insert into public.user_roles (user_id, role)
   values ('<the-user-uuid>', 'owner');
   ```
4. Copy the project URL and the **publishable** key. Never put the service role
   key in this project — nothing needs it, and Vite would inline it into the
   client bundle.

### Vercel

1. Import the repository. Root directory is the repo root — no override needed.
2. Framework preset: **Other**. Build command `npm run build`, output directory
   `.vercel/output` — the Nitro Vercel preset writes the Build Output API v3
   structure directly.
3. Set the environment variables from `.env.example` in Production and Preview.
4. Deploy. The security headers and CSP are written in `vercel.json` and served
   through Nitro route rules (`scripts/security-headers.mjs`, from core), because
   a Build Output API deployment reads the generated config rather than
   `vercel.json`. After the first deploy, `curl -I` the live site and check for
   `content-security-policy` — that is the only proof that counts.

### Before it goes live

The admin dashboard lists these; they are also worth stating here.

- [ ] **Every price is a placeholder.** Each seeded price carries
      `priceConfirmed: false`. They are plausible, they are not Drive Precise's
      decisions, and publishing them is a commercial promise.
- [ ] **Phone, WhatsApp and email are placeholders.** Until set they use Ofcom's
      reserved drama ranges, which reach nobody — deliberately, so an
      unconfigured site can't send a customer to a stranger's phone.
- [ ] **Companies House number and registered office are unset.** A UK limited
      company is required to publish both.
- [ ] **The legal pages are honest drafts, not reviewed by a solicitor.** They
      describe how the business actually works, which is the right starting
      point, but consumer contract terms and the privacy notice have statutory
      content requirements.
- [ ] Add a real `favicon.ico` and `og-image.jpg` to `public/`.

---

## How it's put together

```
src/
  lib/
    services.ts          The catalogue: types, seed data, price presentation
    packages.ts          Packages + the upgrade arithmetic
    addons.ts            Contextual add-on engine, partner suggestions
    basket.ts            Quote draft store, persistence, totals
    enquiry.ts           Validation, immutable snapshot, submission
    whatsapp.ts          The prefilled handoff message
    service-catalog.ts   Database overlay over the shipped catalogue
    search.ts            Symptom-aware site search
    business.ts          Contact details, service areas, postcode coverage
    symptoms.ts          "What does your car need?" routing table
    attribution.ts       UTM capture and referral source
    analytics.ts         Cookieless funnel events
    seo.ts               Page metadata + structured data
  routes/                File-based routes (TanStack Router)
  components/site/       Site chrome and the builder's parts
supabase/migrations/     Schema, RLS, and the definer functions that are the
                         only public read and write paths
scripts/smoke.mjs        Browser smoke test
```

### The customer journey

```
Home / search / symptom router
        ↓
Category or service page          ← indicative price visible throughout
        ↓
/quote  Vehicle → Service → Extras → Where & when → Details → Review
        ↓
Structured enquiry stored, DP-#### reference issued
        ↓
Prefilled WhatsApp message — the customer only presses send
        ↓
Drive Precise confirms the vehicle-specific price
        ↓
Admin marks it quoted / accepted / booked, copies the TechMan block
        ↓
TechMan sends the estimate; the customer approves and pays on its portal
```

The second door, for work with a genuinely fixed price:

```
/book  →  postcode coverage check  →  TechMan web booking widget
                                              ↓
                                     straight into the live diary
```

Only a single, confirmed, fixed-price service mapped to a labour slot may be
booked this way — `selfBookableSlot()` is the gate, and §20 is why.

### Design rules the code enforces

These are from the client brief and are covered by tests, not just prose.

| Rule                                                                             | Where it lives                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Three pricing types, never blurred. A `quote` service has no price field at all. | `services.ts`, `priceLabel()`, a CHECK constraint in SQL                          |
| Never fabricate a saving                                                         | `packageUpgrades()` returns nothing unless the arithmetic is honest on both sides |
| The basket total is never the bare word "Total"                                  | `totalLabel()`                                                                    |
| No diagnostics until the equipment exists                                        | `CATEGORY_ORDER` omits `diagnostics`; the services are `active: false`            |
| No air-conditioning regas                                                        | Asserted across every public description                                          |
| Never invent vehicle details                                                     | `describeVehicle()` returns "Model to confirm"                                    |
| Internal cost data never reaches a browser                                       | `toPublicService()`, and `get_public_services()` names its columns                |
| Not affiliated with BMW                                                          | Stated in the footer on every page                                                |

### Security posture

- **No public read path to any table.** The catalogue is served by
  `get_public_services()` / `get_public_packages()`, `SECURITY DEFINER` functions
  whose column list is the contract. An RLS policy filters rows but cannot hide a
  column — a `select('*')` would have returned parts cost and internal notes.
- **No anon read on `enquiries` at all.** Writes go through `create_enquiry()`,
  which returns only the reference. PostgREST's `.insert().select()` needs a
  SELECT policy to return anything, and granting one would have exposed every
  customer's name, number and registration to anyone holding the publishable key.
- **Admin role checked against the database**, not read from a JWT claim, so a
  revoked role takes effect immediately rather than when the token expires.
- Rate limiting and length caps in `create_enquiry()`; analytics writes are
  bounded and swallow their own errors.

---

## Data model

| Table                           | Purpose                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `services`, `service_packages`  | The catalogue, editable without a deploy                |
| `enquiries`                     | The quote request, frozen at submit, plus its lifecycle |
| `trade_enquiries`               | B2B, separate lifecycle, never mixed with retail        |
| `partners`, `partner_referrals` | Partner network and the referral ledger                 |
| `campaigns`                     | Seasonal homepage banners                               |
| `site_events`                   | Cookieless funnel events                                |
| `user_roles`                    | Staff access                                            |

Views: `enquiry_funnel_daily`, `service_attachment`, `partner_referral_summary`.

## Not built yet, by design

Customer accounts (§38), automated review requests (§39) and service reminders
(§40). The schema has room for each; none of them block launch.

**TechMan API integration** (§28) remains unbuilt because no supported API
exists, not because nobody got to it. The website now embeds TechMan's booking
widget at `/book` and links its customer portal, and `techman-handoff.ts` is an
interface with a `manual` provider live and an `api` provider dark — so the day
TechMan confirm credentials, nothing that calls it has to change.
