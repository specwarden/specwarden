---
name: specwarden-security
description: Use when a repository must not carry credential-shaped strings — wiring the secret scan, its allowlist, its ratchet, and deciding what to do when it fires.
---

# specwarden-security

`@specwarden/security`

## When to reach for it

Any repository that could ever hold a credential — which is every repository with a
config file. `secretScan` refuses a credential-shaped string in a tracked file, before the
push rather than at it. It is the check most repositories want first.

## The wiring

The defaults are the configuration for most repositories — the id is `secret-scan` and the
rule is the package's own:

```js
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  allowlist: [{ file: 'docs/examples/keys.md', patternId: '*', why: 'the document IS the pattern list' }],
  hint: 'If the value is real, ROTATE it before deleting the line — it is already in your working tree.',
});
```

- **The allowlist is for a file that NECESSARILY contains the pattern** — a document about
  credential formats, a fixture, the pattern library itself. Every entry carries the file
  and why. It is not for a secret you have not rotated yet: that is an incident.
- **`except`** leaves whole files out, on top of the defaults (lockfiles, build output,
  binaries); `files` narrows what is scanned. Both are git pathspecs.
- **The pattern library is a PRESET, not a mandate.** Add your own with `patterns.extra`;
  switch one off with `patterns.disable`, which requires a reason and reports it; replace
  the lot with `patterns.replace` when your repository has its own catalogue.
- **`ratchet: n`** arms the scan over a tree that already carries `n` known matches.

### When it fires, rotate first

A credential in a commit is in the history and in every clone of it. Deleting the line
makes the repository look clean and changes nothing about the secret. **Rotate, then
delete.** The hint above exists so the person who meets this at 2am does the two steps in
the right order.

## What it refuses

At load, by name: an option it does not have (`scan` for `files`, `skipPaths` for
`except`), a key under `patterns` other than `extra`, `disable`, `replace` (`add` used to
be ignored, and the pattern it carried was never scanned for), an allowlist entry key other
than `file`, `patternId`, `why`, an empty `files`, and `zone`. At run time: a scan that
examined no file fails rather than reporting "no credentials" about nothing.

## Refuse to

- allowlist a real credential;
- widen a pattern to make a false positive go away without checking what else it now
  misses — a pattern that matches less is a scan that finds less, silently;
- declare `corpus: { atLeast: 0 }` over a scan whose `files` matched nothing by mistake.
