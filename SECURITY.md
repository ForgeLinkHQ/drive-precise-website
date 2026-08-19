# Reporting a security issue

Email **security@forgelink.co** and give us a way to reach you. Please do not
open a public issue for anything exploitable.

We will confirm receipt within two working days and tell you what we are doing
about it.

## What matters most here

Every site on this platform is a real business with real customers, and the
data is theirs rather than ours. The things we most want to hear about:

- **Cross-client data access.** Each client has their own database. Anything
  that reaches from one client's data into another's is the most serious class
  of bug this platform can have.
- **Row Level Security bypasses**, or a `SECURITY DEFINER` function that returns
  more than its named column list.
- **Anything that exposes a service-role key**, which bypasses every access rule
  in the database it belongs to.
- **Customer personal data** reaching somewhere it should not: analytics, logs,
  a share link, an error page.

## What is already known and not a finding

- The Supabase publishable key ships in the browser bundle. It is designed to,
  and every table it can reach is protected by RLS.
- `mailto:` and `tel:` hrefs are built from stored contact details. The scheme
  is a literal and the address is percent-encoded, so header injection is not
  possible. Scanners flag this; it is not exploitable.
- Client service-role keys are currently stored in plaintext in the Portal's
  database. This is known, recorded in the schema, and being moved to Vault.
