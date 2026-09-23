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
import { docPaths, docSymbols, docCounts, docHygiene, docPlacement } from '@specwarden/docs';

export const checks = [docPaths({ id: 'doc-paths', title: 'documented paths resolve', tier: 'fast', docs: '**/*.md' })];
```

The engine discovers any file under `checks/` at any depth. Nothing has to be named in
`warden.config.mjs`.

## The five checks

### `docPaths` — a backticked path resolves

Reads every backticked token that looks like a repository path (it carries a slash) and
asserts the file is there. A renamed directory turns every document that mentions it into
a set of instructions that cannot be followed, and nothing else in a repository notices.

```js
docPaths({ id: 'doc-paths', title: '…', tier: 'fast', docs: '**/*.md' });
```

Write an illustrative path as a folder and a filename rather than `dir/file.ext`, or the
check will correctly refuse it.

### `docSymbols` — an identifier named in prose is declared somewhere

```js
docSymbols({
  id: 'doc-symbols',
  title: '…',
  tier: 'fast',
  docs: '**/*.md',
  code: ['src/**/*.ts'],
  suffixes: ['Service', 'Repository', 'Gateway'],
});
```

`suffixes` is what makes this usable: it narrows the corpus to identifiers whose _shape_
declares a kind. Without it every backticked word in prose becomes a claim, and the check
is turned off within a week.

### `docCounts` — an inventory the repository owns is derived, never restated

A sentence like "there are 4 services" is a number nobody re-counts. `countableNouns` are
the nouns whose totals the repository itself owns.

```js
docCounts({
  id: 'doc-counts',
  title: '…',
  tier: 'fast',
  countableNouns: ['services', 'gates', 'modules'],
  skipped: [],
  allowlist: () => [],
  countRatchet: 0,
  when: () => true,
});
```

It reads NUMERALS, not words: "four" in prose is as often a quantity as a count.

### `docPlacement` — a document sits where the contract says its kind lives

```js
docPlacement({
  id: 'doc-placement',
  title: '…',
  tier: 'fast',
  docs: '**/*_MODULE.md',
  allowed: [/^src\/[^/]+\/[^/]+_MODULE\.md$/],
});
```

### `docHygiene` — a relative link points at something that exists

Follows `./` and `../` only. An absolute-looking path is not a link this check reads.

## The two ways this goes wrong

**A corpus that matched nothing.** A `docs` pathspec that stops matching makes every one
of these pass over an empty set. The checks declare a corpus floor for exactly that, and
the floor is what turns the failure from invisible into loud. Do not remove it because a
new repository has few documents — raise the floor when the corpus grows, never lower it
to make a run green.

**A ratchet used as an off switch.** `countRatchet` exists so a repository with existing
prose can arm the rule today and pay the debt down. A ratchet that goes up is a rule
being retired, and it should be retired out loud instead.
