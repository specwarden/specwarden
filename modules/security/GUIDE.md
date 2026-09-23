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

export const check = secretScan({ id: 'secret-scan', title: 'no credential in the tree' });
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
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential in the tree',
  allowlist: [{ file: 'docs/CREDENTIAL-FORMATS.md', patternId: '*', why: 'the document IS the format list' }],
});
```

An entry takes `file` (an exact path, never a prefix), `patternId` (or `*`) and `why`;
anything else is refused by name.

A document about credential formats, a fixture, the pattern library itself. **Not** for a
secret nobody has rotated yet: that is not an allowlist entry, it is an incident. If a
match is real, **rotate it before deleting the line** — deleting it from the working tree
leaves it in the history and in whatever already read it.

## Tuning the pattern library

```js
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  id: 'secret-scan',
  title: 'no credential in the tree',
  patterns: {
    extra: [{ id: 'acme-key', label: 'Acme API key', re: /\bacme_[a-z0-9]{32}\b/ }],
    disable: [{ id: 'telegram-bot-token', why: 'this vendor is not used here' }],
  },
});
```

`patterns` takes three verbs and nothing else: `extra` adds beside the built-ins (an id
already built in overrides it), `disable` switches a built-in off by id with a reason, and
`replace` supplies the whole library. **Any other key is refused when the file loads** — a
misspelled verb was ignored before, and the pattern it carried was never scanned for. The
built-in ids are `telegram-bot-token`, `aws-access-key-id`, `private-key-block`,
`slack-webhook` and `secret-env-assignment`, exported as `BUILT_IN_SECRET_PATTERNS`.

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

## Options

Beside the engine's identity — `id`, `title`, `tier` (default `fast`), `when`, `hint`,
`rule`, `ratchet` — and each refused by name if misspelled:

| Option               | Kind                          | Default                                                   |
| -------------------- | ----------------------------- | --------------------------------------------------------- |
| `scan`               | git pathspec                  | every tracked file                                        |
| `skipPaths`          | path prefixes or fragments    | lockfiles, `.git/`, `node_modules/`, `dist/`, `coverage/` |
| `skipExtensions`     | extensions                    | images, archives, fonts, media                            |
| `maxBytes`           | number                        | 1 MB                                                      |
| `allowlist`          | `[{ file, patternId, why }]`  | none                                                      |
| `patterns`           | `{ extra, disable, replace }` | the built-in library                                      |
| `placeholderMarkers` | RegExp                        | `DEFAULT_PLACEHOLDER_MARKERS`                             |

A scan that examined no file after the skipped paths fails, naming the pathspec.
