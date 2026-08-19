# Working in this repository

Read [FORGELINK_LAW.md](./FORGELINK_LAW.md) first. It is short, it is the same
in every ForgeLink repository, and the build enforces it.

## The one question

Before writing a fix, ask: **would another client of the same trade need this
changed?**

- **No** — it is function. It belongs in `forgelink-portal/core`. Change it
  there, run `node scripts/core-publish.mjs`, then `node scripts/core-sync.mjs`
  in each client repo. Fixing it only here is how two clients stop being one
  platform.
- **Yes** — it is semantics. It belongs here, or in `site_content`, or in
  environment configuration. Never a client's name or number in a shared file.

If you genuinely cannot unify it today, say so in `forgelink.core.json` under
`duplication`, with a status and an owner. The build accepts a recorded
divergence. It does not accept an unrecorded one.

## Branches

**A branch is finished when its pull request merges.** Do not push to it again.
A merged pull request never reopens, so later commits get no review, no
discussion, and reach nobody. Start a new branch instead.

This is not a style preference. Four branches across this platform sat unmerged
for up to five days exactly this way, one of them carrying a security fix, and
nothing reported it.

## Before opening a pull request

```
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs on every branch, so a push tells you within a couple of minutes whether
you have broken something, whether or not a pull request exists yet.

## Tests

A rule kept by remembering is not kept. If you fix something a test could have
caught, add the test in the same commit. If the rule applies to every client,
the test is a core file and travels with core.

## Commit messages

Say what changed and why it was wrong before. The diff already says what the
code does now; the message is the only place the reason survives.
