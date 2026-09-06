# Drive Precise Website → Control Centre

The website's existing `owner_alert_queue` is the durable source for operational events. The dispatcher now fans each queued event to both the owner notification function and `sync-control-centre`. Customer form submission never waits on either network call.

## Edge Function secrets

Set these in the Drive Precise website Supabase project:

- `CONTROL_CENTRE_INGEST_URL=https://budgetaccountingforge.vercel.app/api/integrations/drive-precise/enquiry`
- `CONTROL_CENTRE_INGEST_SECRET=<long random shared secret>`

Set the exact same secret in the Control Centre Vercel project as:

- `DRIVE_PRECISE_INGEST_SECRET=<same value>`

Deploy the `sync-control-centre` Edge Function and apply migration `20260906040000_control_centre_dispatch.sql`.

The Control Centre currently consumes `new_enquiry` and `quote_accepted`. Trade/stale events remain owner-notification events and are harmlessly ignored by the Control Centre endpoint.

The handoff is idempotent by the website enquiry reference (`DP-xxxx`): a new enquiry creates/updates its canonical customer, vehicle and quote-required job; quote acceptance updates that same job rather than creating another copy.
