# The ForgeLink Law

One file, byte-identical in every ForgeLink repository. It is the first entry in
the core registry, so a repo that edits its own copy fails its own build.

This exists because of a real failure, recorded here so the reason survives:

> On 17 August a shared CORS module was written for Drive Precise. On 18 August,
> nineteen hours later, the same module was written again for C. Beauty under a
> different filename. Neither session knew the other existed. At the same moment
> `owner-recipient.ts` existed in both repositories at 76 and 75 lines with only
> 43 lines in common, and `email-template.ts` at 268 and 113 lines with only 38.
> Two clients was enough for the drift to start. The plan is thousands.

The platform is built by forking and tailoring. That is not a weakness to design
away, it is the workflow. These laws exist to make forking safe.

---

## Law 1: Function is shared. Semantics are local.

Every line of code is one of two things.

**Function** is code that does a job: sending a preflight response, hashing a
token, formatting a price, laying out an email. It contains no client's name, no
trade's vocabulary, no business's phone number. Function is identical for every
client on the platform and belongs to **core**.

**Semantics** are the words and identity wrapped around function: a business
name, a strapline, a director, a service area, whether a slot is called an
appointment or a job. Semantics differ per client and per trade and belong to
**configuration or the database**, never to a TypeScript literal.

The test for which one you are looking at: _would a different client on the same
trade need this changed?_ If no, it is function. If yes, it is semantics.

**Enforced by:** `core-drift.test.ts` fails a core file containing any string on
the client-identity denylist.

---

## Law 2: A core file is never edited in a client repository.

Core files are synced in, not maintained locally. To change one you change it in
canonical, publish a new core version, and sync. There is no other route.

Editing a core file in one client is how two clients stop being the same
platform. It is the exact failure recorded at the top of this file.

**Enforced by:** `core-drift.test.ts` hashes every registered core file against
the version recorded in the manifest that was synced from canonical. A local
edit fails the build with the path and the remedy.

---

## Law 3: A fix that is function is made in core, or it is not finished.

Fixing a bug in one client repository and stopping there is the default
behaviour and it is forbidden. Ask Law 1's question about the fix. If it is
function, it belongs in core, and every client gets it on their next sync.

If you fix it locally because the client is mid-launch and you cannot wait,
**register it** in the drift queue in the same commit. An unregistered local
divergence is the bug this law exists to prevent.

**Enforced by:** `core-drift.test.ts` requires every entry in the duplication
registry to carry a status and an owner. Nothing may sit unowned.

---

## Law 4: A new trade is a configuration file. A new client is a row.

A trade (salon, garage, restaurant) is a vertical definition: a module set,
vocabulary and behaviour axes. Adding one must not require a new module, a new
engine, or a new repository. When it does, the module registry is wrong and the
registry is what gets fixed.

A client is not a repository. A client is a row in `portal_sites`, a Supabase
project, a deployment of their trade's template, and their content in the
database.

At one hundred thousand clients there are single-figure template repositories.
If that number tracks client count, the platform has failed.

**Enforced by:** the vertical registry, and `verticals.test.ts` asserting the
roadmap trades need no module that does not already exist.

---

## Law 5: Client identity never lives in code.

A template serves every client of its trade. The moment a business name,
telephone number, registered address, service area or opening hour is written as
a literal in TypeScript, that template serves exactly one client and the next
one requires a fork.

Identity lives in the database (`site_content`) or in environment configuration.
Code reads it. Code never contains it.

**Enforced by:** `core-drift.test.ts` denylist, and the `site_content` contract.

---

## Law 6: Every core capability ships with the test that protects it.

A rule kept by remembering is not kept. When core gains a capability it gains
the contract test that fails if a template drops it, and that test travels with
core into every repository.

This is why the CORS consolidation was safe in one repository and absent in the
other: the test that forbade hand-rolled headers protected only the repository
it was written in.

**Enforced by:** core tests are registered core files, so a template cannot
delete one without failing the drift check.

---

## Law 7: Every repository states the law.

Every repository carries `CLAUDE.md`, and it links here. A session that opens a
repository reads the law before it writes a line. A repository without one is
how a rule gets broken by someone who never knew it existed.

**Enforced by:** `core-drift.test.ts` asserts `CLAUDE.md` exists and references
this file.

---

## How to obey the law in practice

**Before writing a fix, ask Law 1's question.** Would another client of the same
trade need this changed? No means core.

**To change core:**

```
# in the canonical repository
edit core/<file>
node scripts/core-publish.mjs     # bumps version, rewrites hashes
# in each client repository
node scripts/core-sync.mjs        # pulls files and manifest together
npm test
```

**To record a divergence you cannot fix yet:** add it to `forgelink.core.json`
under `duplication`, with a status and an owner. The build will accept it and
the registry will keep asking.

---

## What is canonical

Canonical core lives in `forgelink-portal/core/`. The manifest is copied from
canonical along with the files, never generated locally, so a hash cannot be
updated without pulling the file it describes.

The drift test never reads another repository. It compares against the committed
manifest. This is deliberate: a check that needs a sibling checkout silently
passes on CI where that checkout never exists, which has already happened once
on this platform and cost two security tests that reported green while asserting
nothing.
