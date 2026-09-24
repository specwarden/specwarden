# @specwarden/security — guide

One check, `secret-scan`: a credential-shaped string does not reach the repository.

## What it catches

A credential committed to a **tracked** file — an AWS access key id, a Telegram bot token,
a private-key block, a Slack webhook URL, and a random-looking value assigned to a name
ending in `PASSWORD`, `SECRET` or `TOKEN`. Forge-side push protection covers this on some
plans; this is free, sub-second, runs before the push rather than at it, and matches the
formats a project actually handles.

A pasted credential in an untracked file is caught the moment it is added, and
dependencies are never scanned.

## Wiring

```bash
pnpm add -D @specwarden/security
```

```js
// .specwarden/checks/security/secret-scan.check.mjs
import { secretScan } from '@specwarden/security';

export const check = secretScan();
```

That is the whole configuration for most repositories. The id is `secret-scan`, and the
check carries the rule the package implies — "no credential is committed to the
repository", owned by `@specwarden/security`. Everything below is for the cases where the
defaults are not enough.

The allowlist is for a file that NECESSARILY contains the pattern:

```js
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  allowlist: [{ file: 'docs/CREDENTIAL-FORMATS.md', patternId: '*', why: 'the document IS the format list' }],
});
```

A document about credential formats, a fixture, the pattern library itself. **Not** for a
secret nobody has rotated yet: that is not an allowlist entry, it is an incident. An entry
takes `file` (an exact path, never a prefix), `patternId` (or `*`) and `why`; anything else
is refused by name. An allowlisted file is still scanned for every other pattern — to
leave a file out entirely, name it in `except`.

The pattern library is a preset, not a mandate:

```js
import { secretScan } from '@specwarden/security';

export const check = secretScan({
  patterns: {
    extra: [{ id: 'acme-key', label: 'Acme API key', re: /\bacme_[a-z0-9]{32}\b/ }],
    disable: [{ id: 'telegram-bot-token', why: 'this vendor is not used here' }],
  },
});
```

`patterns` takes three verbs and nothing else: `extra` adds beside the built-ins (an id
already built in overrides it), `disable` switches a built-in off by id with a reason, and
`replace` supplies the whole library. The built-in ids are `telegram-bot-token`,
`aws-access-key-id`, `private-key-block`, `slack-webhook` and `secret-env-assignment`,
exported as `BUILT_IN_SECRET_PATTERNS`. A pattern is worth adding only when it is anchored
to a format specific enough that a match _means_ something — a noisy guard is a disabled
guard.

## Options

Beside the engine's identity — `id`, `title`, `tier` (default `fast`), `when`, `hint`,
`advisory`, `rule`, `ratchet` — each refused by name if misspelled, empty where a list is
expected, or of the wrong kind. `zone` is refused: the check speaks for its module.

| Option               | Kind                          | Default                                                    |
| -------------------- | ----------------------------- | ---------------------------------------------------------- |
| `files`              | git pathspec, or a list       | every tracked file                                         |
| `except`             | git pathspecs left out        | none, beside `DEFAULT_SECRET_EXCEPT`, which always applies |
| `maxBytes`           | number                        | 1 MB                                                       |
| `allowlist`          | `[{ file, patternId, why }]`  | none                                                       |
| `patterns`           | `{ extra, disable, replace }` | the built-in library                                       |
| `placeholderMarkers` | RegExp                        | `DEFAULT_PLACEHOLDER_MARKERS`                              |
| `corpus`             | `{ atLeast, why }`            | `{ atLeast: 1 }`                                           |

`DEFAULT_SECRET_EXCEPT` leaves out lockfiles, `node_modules/`, `dist/`, `coverage/`,
images, archives, fonts, media and `.tsbuildinfo`; a file over `maxBytes` or holding a NUL
byte is not read either. Anything template-shaped on a line suppresses a match there:
`${…}`, `<angle-brackets>`, `PLACEHOLDER`, `EXAMPLE`, `CHANGEME`, `YOUR_`, `xxx`. The
vocabulary is English and conventional, so a repository whose placeholders read
differently sets `placeholderMarkers`.

## What fails and what passes

- **A match fails**, one finding per line and pattern, carrying the file and line:
  `src/config.ts:1 — AWS access key id [aws-access-key-id]. If real, ROTATE it before
deleting the line; …`. If a match is real, **rotate it before deleting the line** —
  deleting it from the working tree leaves it in the history and in whatever already read
  it.
- **A scan that examined no file fails**, below the corpus floor: a `files` pathspec that
  matched nothing, or an `except` that swallowed everything, would otherwise report "no
  credentials" about a corpus of none. `corpus: { atLeast: 0 }` says, in writing, that an
  empty set is expected.
- **A clean pass says what it read**: `✓ secret-scan — 214 file(s) examined, clean`.
- **Every deviation from the built-in library is an info finding, printed first**, before
  any match. A scanner that quietly stopped looking for something reads exactly like one
  that looked and found nothing — so it does not get to be quiet.
- **`ratchet`** tolerates the debt a tree already has, so the rule can be armed today and
  paid down; it refuses the next unit of debt. A ratchet that goes up is the rule being
  retired, and it should be retired out loud.
