<!-- GENERATED from modules/docs/GUIDE.md. Edit the guide. -->

# @specwarden/docs — guide

Five checks over documentation. Each answers a question a reader cannot answer for
themselves, and each fails in the one way documentation fails: quietly, long after the
code moved.

## What it catches

| Check           | Factory        | Catches                                                                        |
| --------------- | -------------- | ------------------------------------------------------------------------------ |
| `doc-paths`     | `docPaths`     | a backticked repository path that no longer resolves                           |
| `doc-symbols`   | `docSymbols`   | a class, function or type named in prose that nothing in the code declares     |
| `doc-counts`    | `docCounts`    | a count restated in prose that the repository already owns; a bare menu number |
| `doc-placement` | `docPlacement` | a document where the placement contract does not say its kind lives            |
| `doc-hygiene`   | `docHygiene`   | a dead relative link, a pointer into a MOVED section, an over-long table row   |

## Wiring

```bash
pnpm add -D @specwarden/docs
```

The whole module in one file:

```js
// .specwarden/checks/docs/docs.check.mjs
import { docsChecks } from '@specwarden/docs';

export const checks = docsChecks({
  code: ['src/**/*.ts'],
  suffixes: ['Service', 'Repository', 'Gateway'],
  countableNouns: ['services', 'modules'],
  placement: { docs: '**/*_MODULE.md', allowed: [/^src\/[^/]+\/[^/]+_MODULE\.md$/] },
});
```

That is all five, each reading every tracked markdown file. The three facts it asks for
are the three no package can know: the endings that make a word a symbol, the nouns whose
count your repository owns, and where a document may live. A missing one is refused by
name when the file loads. A check you do not want is left out with `false`:

```js
import { docsChecks } from '@specwarden/docs';

export const checks = docsChecks({
  code: ['src/**/*.ts'],
  suffixes: ['Service'],
  counts: false,
  placement: false,
});
```

Or one check per file, with only the facts it cannot default:

```js
// .specwarden/checks/docs/doc-counts.check.mjs
import { docCounts } from '@specwarden/docs';

export const check = docCounts({ countableNouns: ['services'] });
```

A check's id is its factory's name in kebab case (`doc-paths`, `doc-symbols`, …), its title
is the rule it enforces, and that rule is implied by the package, owned by
`@specwarden/docs`. Write `id` or `rule` only to say something else. The engine discovers
any file under `checks/` at any depth; nothing has to be named in `config.mjs`.

## Options

Every factory takes the engine's identity beside its own options — `id`, `title`, `tier`
(default `fast`), `when` (default: always relevant), `hint`, `advisory`, `rule` and
`ratchet` — plus `corpus: { atLeast }`, how many documents a run must read (default 1). It
refuses `zone`, an option it does not have, an empty list and a value of the wrong kind,
by name, when the file loads. A misspelled option used to be dropped in silence, and the
check ran without it.

Every check names its corpus `docs` — a git pathspec over tracked files, or a list of them
— and leaves files out with `except`, pathspecs read the way git reads them: `docs/_archive`
is that directory, `**/dist/**` built output at any depth.

**`docsChecks`** says what every check shares once, and takes one entry per check: its own
options, laid over the preset's, or `false` to leave it out. It refuses `id`, `title`,
`rule` and `ratchet` — five checks cannot share one; give it in that check's entry.

| Option           | Kind                                                     | Default      |
| ---------------- | -------------------------------------------------------- | ------------ |
| `docs`           | git pathspec, or a list                                  | `**/*.md`    |
| `except`         | git pathspecs, left out of every check                   | none         |
| `corpus`         | `{ atLeast }`, held by every check                       | one document |
| `tier`           | tier, applied to every check                             | `fast`       |
| `when`           | relevance, applied to every check                        | always       |
| `code`           | git pathspec, or a list, never empty                     | — required   |
| `suffixes`       | strings, never empty                                     | — required   |
| `countableNouns` | strings, never empty                                     | — required   |
| `paths`          | `docPaths` options, or `false`                           | the preset's |
| `symbols`        | `docSymbols` options, or `false`                         | the preset's |
| `counts`         | `docCounts` options, or `false`                          | the preset's |
| `placement`      | `docPlacement` options — `allowed` required — or `false` | — required   |
| `hygiene`        | `docHygiene` options, or `false`                         | the preset's |

### `docPaths`

Reads every backticked token that looks like a repository path — it carries a slash and an
extension — and asserts the file is there, resolved against the document's own directory,
every ancestor of it, then the `prefixes`. Write an illustrative path as a folder and a
filename rather than `dir/file.ext`, or name it in `illustrative`.

| Option             | Kind                                     | Default   |
| ------------------ | ---------------------------------------- | --------- |
| `docs`             | git pathspec, or a list                  | `**/*.md` |
| `except`           | git pathspecs                            | none      |
| `illustrative`     | paths deliberately absent                | none      |
| `prefixes`         | workspace roots a path may omit (`{ws}`) | none      |
| `externalPrefixes` | sibling-checkout prefixes, assumed there | none      |

### `docSymbols`

A backticked PascalCase name ending in one of your `suffixes` must be declared somewhere in
the `code` corpus, or be a framework's. An empty `suffixes` is refused: the suffixes are an
alternation, and an alternation of nothing matches every backticked PascalCase name — the
widest setting there is, not an inert one. `except` leaves files out of both corpora.

| Option         | Kind                                 | Default                                      |
| -------------- | ------------------------------------ | -------------------------------------------- |
| `code`         | git pathspec, or a list, never empty | — required                                   |
| `suffixes`     | strings, never empty                 | — required                                   |
| `docs`         | git pathspec, or a list              | `**/*.md`                                    |
| `except`       | git pathspecs                        | none                                         |
| `external`     | symbols a framework owns             | none                                         |
| `illustrative` | deliberate illustrations             | none                                         |
| `symbolRef`    | RegExp, global, capturing the name   | `DEFAULT_SYMBOL_REF` — backticked PascalCase |
| `declaration`  | RegExp, global, capturing the name   | `DEFAULT_DECLARATION` — TypeScript           |

### `docCounts`

A sentence like "there are 4 services" is a number nobody re-counts. It reads NUMERALS, not
words — "four" in prose is as often a quantity as a count — and leaves alone a number that
is hedged ("about 70"), dated ("measured 2026-07-30") or an ordinal ("step 3"). An empty
`countableNouns` is refused for the same reason an empty `suffixes` is: it matched every
number.

The optional menu half asks that a menu number travel with its label: "option 12 (Export
globals)", never a bare "option 12", which a renumbered menu silently points elsewhere.

| Option           | Kind                                    | Default                          |
| ---------------- | --------------------------------------- | -------------------------------- |
| `countableNouns` | strings, never empty                    | — required                       |
| `docs`           | git pathspec, or a list                 | `**/*.md`                        |
| `except`         | git pathspecs                           | none                             |
| `allowlist`      | `(read) => [{ claim, paths }]`          | none                             |
| `menu`           | `{ source, item, reference, dispatch }` | no menu half                     |
| `hedge`          | RegExp source fragment                  | `DEFAULT_HEDGE` — English        |
| `ordinalLead`    | RegExp source fragment                  | `DEFAULT_ORDINAL_LEAD` — English |
| `number`         | RegExp source fragment                  | `DEFAULT_NUMBER` — digits        |
| `dated`          | RegExp                                  | `DEFAULT_DATED` — English        |

The four grammars are English by default, and exported, so a repository writing in another
language adapts them rather than meeting a check that finds nothing.

### `docPlacement`

Every document must match one row of the contract. A location no row describes is not
wrong — it is undecided, which is where a second copy of a rule is born. `link` optionally
bans a link into a folder from outside it: a plan is deleted when its work ends, so every
inbound pointer is a delayed dangling one.

| Option    | Kind                                  | Default    |
| --------- | ------------------------------------- | ---------- |
| `allowed` | RegExps — the placement contract      | — required |
| `docs`    | git pathspec, or a list               | `**/*.md`  |
| `except`  | git pathspecs                         | none       |
| `link`    | `{ pattern, dir, allow }` inbound ban | none       |

### `docHygiene`

Follows `./` and `../` links only — an absolute-looking path is not a link it reads — and a
`` `DOC.md` §N `` pointer into a section headed MOVED. Links inside a code fence or a code
span are examples, and are not read. `except` is how a source rendered into another
document is kept from being read twice.

| Option         | Kind                      | Default   |
| -------------- | ------------------------- | --------- |
| `docs`         | git pathspec, or a list   | `**/*.md` |
| `except`       | git pathspecs             | none      |
| `fatCellLimit` | characters in a table row | `300`     |

## What fails and what passes

A clean pass prints what it read — `✓ doc-paths — 12 document(s) examined, clean` — and a
run that read fewer documents than `corpus.atLeast` **fails**, naming the pathspec and
whether `except` emptied it: a `docs` pathspec that stopped matching would otherwise make
every one of these pass over nothing. Declare `corpus: { atLeast: 0 }` where an empty set
is expected. Every finding carries the file, and the line where there is one, and says what
to do.

**The ratchet.** Each check counts one kind of debt, and `ratchet: n` tolerates that many:

- `docPaths` — unresolved paths;
- `docSymbols` — distinct undeclared names;
- `docCounts` — restated counts and unlabelled menu numbers, together. A number the menu
  does not have, two dispatch arms for one number, and a menu that cannot be read always
  fail;
- `docPlacement` — misplaced documents. An inbound link always fails;
- `docHygiene` — over-long table rows. A dead link and a pointer into a MOVED section always
  fail.

A tolerated finding is still listed, under a line saying it is tolerated. The stored
threshold (`.specwarden/ratchets/`) wins over the one written inline, and `--tighten` moves
it to what a passing run measured. A ratchet that goes up is a rule being retired — retire
it out loud instead.
