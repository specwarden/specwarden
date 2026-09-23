---
name: specwarden-docs
description: Use when a repository has documentation it needs to keep honest — paths that resolve, symbols that exist, counts that are not restated, files that sit where the placement contract says.
---

# specwarden-docs

`@specwarden/docs`

A repository's documentation goes stale in ways nobody sees, because the reader who
would notice is never the person editing. These five checks each catch one of them.

| Check          | Catches                                                        |
| -------------- | -------------------------------------------------------------- |
| `docPaths`     | a backticked repository path that no longer resolves           |
| `docSymbols`   | a class, function or type named in prose that no longer exists |
| `docCounts`    | a number restated in prose that the repository already owns    |
| `docPlacement` | a document that is not where the contract says its kind lives  |
| `docHygiene`   | a dead link, and prose tables past a budget                    |

## Wiring them

All five, in one file under `.specwarden/checks/`:

```js
import { docsChecks } from '@specwarden/docs';

export const checks = docsChecks({
  code: ['src/**/*.ts'],
  suffixes: ['Service', 'Repository'],
  countableNouns: ['services', 'modules'],
  placement: { allowed: [/^docs\//, /^README\.md$/, /^src\/[^/]+\/[^/]+_MODULE\.md$/] },
  skipDirs: ['docs/_archive/'],
});
```

The corpus is every tracked markdown file unless `docs` says otherwise. A check the
repository does not want is left out with `false` — `counts: false` — never by leaving its
fact out, which is refused by name. One check alone:

```js
import { docPaths } from '@specwarden/docs';

export const check = docPaths({
  id: 'doc-paths',
  title: 'every file path named in documentation resolves',
  skipDirs: ['docs/_archive/'],
});
```

Every factory refuses an option it does not have when the file loads, so a misspelling is
an error naming the option, not a setting that silently did nothing.

## The decision each one asks of you

**`docCounts` needs your countable nouns.** "Twelve services" in prose is a claim
nothing checks; "twelve rows" is usually a config value the document must MATCH. The list
is yours, and a noun on it that your repository does not own produces noise that gets the
whole check switched off. It may not be empty: an empty list matches every number.

**`docSymbols` needs your suffixes**, for the same reason and with the same refusal — an
empty list makes every backticked PascalCase word a symbol.

**`docPlacement` needs your contract.** There is no universal answer to where a
document lives, and a guessed one is a check that fires on every correct file.

**Skips are for trees that are frozen by construction** — generated maps, dated studies,
an archive. Not for a tree you have not got round to fixing: that is what the ratchet is
for, and the difference is that a ratchet is visible and a skip is not.

## Arm it at reality

`docPaths`, `docSymbols`, `docPlacement` and `docHygiene` take a `ratchet`, and
`docCounts` a `countRatchet`. Set it to the current count, and the check passes
today and fails on any increase. Setting it to 0 on a repository with existing debt makes
the check red on day one, and a check that is red for something nobody is about to fix is
a check somebody turns off.

## Refuse to

- add a countable noun whose "how many" is not actually owned by the repository;
- skip a tree instead of ratcheting it — a skip is invisible and never comes back;
- lower a ratchet to make a run green.
