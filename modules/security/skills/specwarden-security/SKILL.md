---
name: specwarden-security
description: Use when a repository must not carry credential-shaped strings — wiring the secret scan, its allowlist, its ratchet, and deciding what to do when it fires.
---

# specwarden-security

`@specwarden/security`

```js
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential-shaped string reaches the repository',
  tier: 'fast',
  ratchet: 0,
  allowlist: [{ file: 'docs/examples/keys.md', patternId: '*', why: 'the document IS the pattern list' }],
  hint: 'If the value is real, ROTATE it before deleting the line — it is already in your working tree.',
});
```

## When it fires, rotate first

A credential in a commit is in the history and in every clone of it. Deleting the line
makes the repository look clean and changes nothing about the secret. **Rotate, then
delete.** The hint above exists so the person who meets this at 2am does the two steps in
the right order.

## The pattern library is a PRESET, not a mandate

It covers a few common vendor formats. Add your own with `patterns.extra`; switch one
off with `patterns.disable` — which requires a reason and reports it, because a silently
disabled pattern is a scan that looks complete and is not; replace the lot with
`patterns.replace` when your house has its own catalogue.

## The allowlist is for a file that NECESSARILY contains the pattern

A document about credential formats, a fixture, the pattern library itself. Every entry
carries the file and, ideally, why. It is not for a secret you have not rotated yet:
that is not an allowlist entry, it is an incident.

## Refuse to

- allowlist a real credential;
- widen a pattern to make a false positive go away without checking what else it now
  misses — a pattern that matches less is a scan that finds less, silently.
