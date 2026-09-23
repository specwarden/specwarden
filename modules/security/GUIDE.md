# @specwarden/security — guide

One check: a credential-shaped string does not reach the repository.

Forge-side push protection covers this on some plans; this is free, sub-second, runs
before the push rather than at it, and matches the formats a project actually handles.

## Install and wire

```bash
pnpm add -D @specwarden/security
```

```js
import { secretScan } from '@specwarden/security';

export const checks = [secretScan({ id: 'secret-scan', title: 'no credential in the tree', tier: 'fast' })];
```

That is the whole configuration for most repositories. Everything below is for the cases
where it is not.

## What it scans

**Tracked files only.** A pasted credential in an untracked file is caught the moment it
is added, and dependencies are never scanned. The default corpus is every tracked file;
lockfiles, `dist/`, `coverage/`, binaries and media are skipped, as are files over 1 MB —
a pasted secret does not hide in a megabyte.

## Placeholders are not secrets

Anything template-shaped is suppressed: `${…}`, `<angle-brackets>`, `PLACEHOLDER`,
`EXAMPLE`, `CHANGEME`, `YOUR_`, `xxx`. The default vocabulary is English and
conventional, so a repository whose placeholders read differently sets
`placeholderMarkers` — a false positive from a table a house cannot reach is how a guard
gets disabled.

## The allowlist is for a file that NECESSARILY contains the pattern

```js
secretScan({
  id: 'secret-scan',
  title: '…',
  tier: 'fast',
  allowlist: [{ file: 'docs/CREDENTIAL-FORMATS.md', patternId: '*' }],
});
```

A document about credential formats, a fixture, the pattern library itself. **Not** for a
secret nobody has rotated yet: that is not an allowlist entry, it is an incident. If a
match is real, **rotate it before deleting the line** — deleting it from the working tree
leaves it in the history and in whatever already read it.

## Tuning the pattern library

```js
secretScan({
  id: 'secret-scan',
  title: '…',
  tier: 'fast',
  patterns: {
    add: [{ id: 'acme-key', label: 'Acme API key', re: /\bacme_[a-z0-9]{32}\b/ }],
    disable: [{ id: 'some-builtin', why: 'this vendor is not used here' }],
  },
});
```

**Every deviation from the built-in library is reported as an info finding, and those
lines come first, before any match.** A scanner that quietly stopped looking for
something reads exactly like one that looked and found nothing — so it does not get to
be quiet.

A pattern is worth adding only when it is anchored to a format specific enough that a
match _means_ something. A noisy guard is a disabled guard.

## The ratchet

`ratchet` tolerates the debt a tree already has, so the rule can be armed today and paid
down. It refuses the next unit of debt, which is the point. A ratchet that goes up is the
rule being retired, and it should be retired out loud.
