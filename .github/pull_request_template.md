## What changed

<!-- One or two sentences. What a reviewer needs before reading the diff. -->

## Function or semantics?

See [FORGELINK_LAW.md](../FORGELINK_LAW.md), Law 1. Would another client of the
same trade need this changed?

- [ ] **Semantics** (this client only) — stays in this repo
- [ ] **Function** (every client) — **made in `forgelink-portal/core` and synced**,
      not fixed only here
- [ ] Function, but fixed locally because a launch could not wait — **registered
      in `forgelink.core.json` under `duplication` with a status and an owner**

## Core

- [ ] No core file was edited in this repo (Law 2). `core-drift.test.ts` proves it.
- [ ] If core changed: published from canonical, and every client repo synced.

## Checks

- [ ] Tests pass locally
- [ ] Anything a test could have caught now has one (Law 6)

## After merge

- [ ] **Do not push more commits to this branch.** A merged pull request never
      reopens, so anything pushed afterwards runs no review and reaches no one.
      Start a new branch.
