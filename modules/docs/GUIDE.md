# @specwarden/docs — guide

Five checks over documentation. Each answers a question a reader cannot answer for
themselves, and each fails in the one way documentation fails: quietly, long after the
code moved.

## Install and wire

```bash
pnpm add -D @specwarden/docs
```

```js
// .specwarden/checks/docs/docs.check.mjs
import { docsChecks } from '@specwarden/docs';

export const checks = docsChecks({
  code: ['src/**/*.ts'],
  suffixes: ['Service', 'Repository', 'Gateway'],
  countableNouns: ['services', 'gates', 'modules'],
  placement: { docs: '**/*_MODULE.md', allowed: [/^src\/[^/]+\/[^/]+_MODULE\.md$/] },
});
```

That is the whole module: `doc-paths`, `doc-symbols`, `doc-counts`, `doc-placement` and
`doc-hygiene`, each in the `fast` tier, all reading every tracked markdown file. The
engine discovers any file under `checks/` at any depth; nothing has to be named in
`warden.config.mjs`.

The three facts it asks for are the three no package can know: the endings that make a
word a symbol, the nouns whose count your repository owns, and where a document may live.
A missing one is refused by name when the file loads. To leave a check out, say so:

```js
import { docsChecks } from '@specwarden/docs';

export const checks = docsChecks({
  code: ['src/**/*.ts'],
  suffixes: ['Service'],
  counts: false,
  placement: false,
});
```

### `docsChecks` options

| Option           | Kind                                                     | Default      |
| ---------------- | -------------------------------------------------------- | ------------ |
| `docs`           | git pathspec                                             | `**/*.md`    |
| `skipDirs`       | directory prefixes                                       | none         |
| `code`           | git pathspecs                                            | — required   |
| `suffixes`       | strings, never empty                                     | — required   |
| `countableNouns` | strings, never empty                                     | — required   |
| `paths`          | `docPaths` options, or `false`                           | the preset's |
| `symbols`        | `docSymbols` options, or `false`                         | the preset's |
| `counts`         | `docCounts` options, or `false`                          | the preset's |
| `placement`      | `docPlacement` options — `allowed` required — or `false` | — required   |
| `hygiene`        | `docHygiene` options, or `false`                         | the preset's |

`skipDirs` reaches `doc-paths`, `doc-symbols` and `doc-counts` — the three that read prose
for claims. Each per-check object is laid over what the preset gives that check, so an
id, a tier, a `rule` or one of the check's own options goes there:

```js
import { docsChecks } from '@specwarden/docs';

export const checks = docsChecks({
  code: ['src/**/*.ts'],
  suffixes: ['Service'],
  countableNouns: ['services'],
  placement: { allowed: [/^docs\//, /^README\.md$/] },
  paths: { illustrative: ['src/example/file.ts'] },
});
```

Every factory refuses an option it does not have, by name, when the file loads — a
misspelled option was dropped in silence before, and the check ran without it.

## The five checks

Each is also exported on its own, for a repository that wants one of them. Every factory
takes the engine's identity — `id`, `title`, `tier` (default `fast`), `when` (default:
always), `hint`, `rule`, `ratchet` — beside the options below.

### `docPaths` — a backticked path resolves

Reads every backticked token that looks like a repository path (it carries a slash and an
extension) and asserts the file is there. A renamed directory turns every document that
mentions it into a set of instructions that cannot be followed, and nothing else in a
repository notices.

```js
import { docPaths } from '@specwarden/docs';

export const check = docPaths({ id: 'doc-paths', title: 'documented paths resolve', skipDirs: ['docs/_archive/'] });
```

| Option             | Kind                                     | Default   |
| ------------------ | ---------------------------------------- | --------- |
| `docs`             | git pathspec                             | `**/*.md` |
| `skipDirs`         | directory prefixes                       | none      |
| `illustrative`     | paths deliberately absent                | none      |
| `prefixes`         | workspace roots a path may omit (`{ws}`) | none      |
| `externalPrefixes` | sibling-checkout prefixes, assumed there | none      |

Write an illustrative path as a folder and a filename rather than `dir/file.ext`, or the
check will correctly refuse it.

### `docSymbols` — an identifier named in prose is declared somewhere

```js
import { docSymbols } from '@specwarden/docs';

export const check = docSymbols({
  id: 'doc-symbols',
  title: 'documented symbols exist',
  code: ['src/**/*.ts'],
  suffixes: ['Service', 'Repository', 'Gateway'],
});
```

`suffixes` is what makes this usable: it narrows the corpus to identifiers whose _shape_
declares a kind. **An empty list is refused**: the suffixes are an alternation, and an
alternation of nothing matches every backticked PascalCase name — the widest setting
there is, not an inert one.

| Option         | Kind                               | Default                 |
| -------------- | ---------------------------------- | ----------------------- |
| `code`         | git pathspecs, never empty         | — required              |
| `suffixes`     | strings, never empty               | — required              |
| `docs`         | git pathspec                       | `**/*.md`               |
| `skipDirs`     | directory prefixes                 | none                    |
| `excludeCode`  | substrings of code paths           | none                    |
| `external`     | symbols a framework owns           | none                    |
| `illustrative` | deliberate illustrations           | none                    |
| `symbolRef`    | RegExp, global, capturing the name | backticked PascalCase   |
| `declaration`  | RegExp, global, capturing the name | TypeScript declarations |

### `docCounts` — an inventory the repository owns is derived, never restated

A sentence like "there are 4 services" is a number nobody re-counts. `countableNouns` are
the nouns whose totals the repository itself owns, and they are the one thing it needs:

```js
import { docCounts } from '@specwarden/docs';

export const check = docCounts({ id: 'doc-counts', title: 'counts are derived', countableNouns: ['services'] });
```

It reads NUMERALS, not words: "four" in prose is as often a quantity as a count. **An empty
`countableNouns` is refused** for the same reason an empty `suffixes` is — it matched every
number.

| Option           | Kind                                    | Default      |
| ---------------- | --------------------------------------- | ------------ |
| `countableNouns` | strings, never empty                    | — required   |
| `docs`           | git pathspec                            | `**/*.md`    |
| `skipped`        | RegExps over paths                      | none         |
| `allowlist`      | `(read) => [{ claim, paths }]`          | none         |
| `countRatchet`   | number of tolerated claims              | `0`          |
| `menu`           | `{ source, item, reference, dispatch }` | no menu half |
| `hedge`          | RegExp source fragment                  | English      |
| `ordinalLead`    | RegExp source fragment                  | English      |
| `numberPattern`  | RegExp source fragment                  | digits       |
| `dated`          | RegExp                                  | English      |

The four grammars are ENGLISH by default, and exported (`DEFAULT_HEDGE`,
`DEFAULT_ORDINAL_LEAD`, `DEFAULT_NUMBER`, `DEFAULT_DATED`) so a repository writing in
another language adapts them rather than meeting a check that finds nothing.

### `docPlacement` — a document sits where the contract says its kind lives

```js
import { docPlacement } from '@specwarden/docs';

export const check = docPlacement({
  id: 'doc-placement',
  title: 'module documents sit beside their module',
  docs: '**/*_MODULE.md',
  allowed: [/^src\/[^/]+\/[^/]+_MODULE\.md$/],
});
```

| Option    | Kind                                  | Default    |
| --------- | ------------------------------------- | ---------- |
| `allowed` | RegExps — the placement contract      | — required |
| `docs`    | git pathspec                          | `**/*.md`  |
| `link`    | `{ pattern, dir, allow }` inbound ban | none       |

### `docHygiene` — a relative link points at something that exists

Follows `./` and `../` only. An absolute-looking path is not a link this check reads.

```js
import { docHygiene } from '@specwarden/docs';

export const check = docHygiene({ id: 'doc-hygiene', title: 'relative links resolve' });
```

| Option            | Kind                                 | Default   |
| ----------------- | ------------------------------------ | --------- |
| `docs`            | git pathspec                         | `**/*.md` |
| `renderedSources` | files rendered into another document | none      |
| `fatCellLimit`    | characters in a table row            | `300`     |

## The two ways this goes wrong

**A corpus that matched nothing.** A `docs` pathspec that stops matching would make every
one of these pass over an empty set, so each of them fails instead and names the
pathspec. Do not work around it because a new repository has few documents — point the
pathspec at where the documents are.

**A ratchet used as an off switch.** `ratchet` and `countRatchet` exist so a repository
with existing prose can arm the rule today and pay the debt down. A ratchet that goes up
is a rule being retired, and it should be retired out loud instead.
