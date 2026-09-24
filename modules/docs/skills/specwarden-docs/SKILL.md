---
name: specwarden-docs
description: Use when a repository has documentation it needs to keep honest — paths that resolve, symbols that exist, counts that are not restated, files that sit where the placement contract says.
---

# specwarden-docs

`@specwarden/docs`

## When to reach for it

A repository's documentation goes stale in ways nobody sees, because the reader who would
notice is never the person editing. Reach for this module when documents name files,
classes or counts the code owns, or when where a document lives is a decision the
repository has made.

| Check           | Catches                                                        |
| --------------- | -------------------------------------------------------------- |
| `doc-paths`     | a backticked repository path that no longer resolves           |
| `doc-symbols`   | a class, function or type named in prose that no longer exists |
| `doc-counts`    | a number restated in prose that the repository already owns    |
| `doc-placement` | a document that is not where the contract says its kind lives  |
| `doc-hygiene`   | a dead link, a pointer into a MOVED section, an over-long row  |

## The wiring

All five, in one file under `.specwarden/checks/`:

```js
import { docsChecks } from '@specwarden/docs';

export const checks = docsChecks({
  code: ['src/**/*.ts'],
  suffixes: ['Service', 'Repository'],
  countableNouns: ['services', 'modules'],
  placement: { allowed: [/^docs\//, /^README\.md$/, /^src\/[^/]+\/[^/]+_MODULE\.md$/] },
  except: ['docs/_archive'],
});
```

The corpus is every tracked markdown file unless `docs` says otherwise, and `except` leaves
pathspecs out of every check. A check the repository does not want is left out with
`false` — `counts: false` — never by leaving its fact out. One check alone:

```js
import { docPaths } from '@specwarden/docs';

export const check = docPaths({ except: ['docs/_archive'] });
```

Each check's id is its factory's name in kebab case, and it carries the rule the package
implies. Write no `id` or `title` unless the repository means something else by it.

**The decisions only you can make.** `docCounts` needs your countable nouns: "twelve
services" in prose is a claim nothing checks, and a noun your repository does not own
produces noise that gets the whole check switched off. `docSymbols` needs your suffixes —
the endings that make a word a class name here. `docPlacement` needs your contract: there
is no universal answer to where a document lives.

**Arm it at reality.** On a repository with existing debt, set `ratchet` to the current
count: the check passes today and fails on any increase, and `--tighten` lowers the stored
bar as the debt is paid. Setting 0 over existing debt makes the check red on day one, and a
check red for something nobody is about to fix is a check somebody turns off.

## What it refuses

- An option a factory does not have, a value of the wrong kind, an empty list, and `zone`
  — by name, when the file loads. Every exemption is `except`, and every bar is `ratchet`.
- `suffixes` or `countableNouns` that are empty or hold `''` — an empty alternation matches
  everything, not nothing.
- On `docsChecks`: a missing fact, and an `id`, `title`, `rule` or `ratchet`, which belong
  to one check — give them in that check's entry (`paths: { ratchet: 3 }`).
- At run time: a corpus that matched nothing, or that `except` emptied. Point the pathspec
  at where the documents are, or declare `corpus: { atLeast: 0 }` if an empty set is
  expected.

## Refuse to

- add a countable noun whose "how many" is not actually owned by the repository;
- leave out a tree with `except` because it has debt — `except` is for trees frozen by
  construction (a generated map, a dated study, an archive); debt is what the ratchet is
  for, and the difference is that a ratchet is visible and an exemption is not;
- raise a ratchet, or lower a corpus floor, to make a run green.
