---
description: Cut a release — changesets checked against the diff, versions, the whole list, publish.
argument-hint: '[packages, if not everything pending]'
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Release **specwarden**. Scope: `$ARGUMENTS`. For anything beyond a routine patch, spawn
`release-manager`, then `adversarial-reviewer` on what it proposes.

The window to unpublish is 72 hours and exists once per version. Stop at any red.

1. **`pnpm build && pnpm gate`** — both tiers green before anything moves.
2. **Read every pending `.changeset/*.md` against the diff.** Is the bump what
   `.changeset/README.md` calls for — including for a verdict change? Is every package whose
   published behaviour moved named? Does it tell a consumer what to DO?
   `pnpm gate --id changesets` catches a name the registry does not have; only you can catch a wrong bump.
3. **`pnpm version:packages`** — changesets writes the numbers and the changelogs.
4. **Review the version diff.** Only versions and changelogs should have moved. Then
   `pnpm scaffold` — plugin manifests and the marketplace carry the new numbers — and
   `pnpm gate --id scaffold-drift`.
5. **`pnpm release`** — the whole list, then the publish-readiness gate with `--releasing`
   (which refuses a package still at `0.0.0`), then publish. Add `--otp=<code>` for 2FA.

A changeset describes the change for whoever INSTALLS the package; the commit describes it
for whoever reads this repository. They are different readers.
