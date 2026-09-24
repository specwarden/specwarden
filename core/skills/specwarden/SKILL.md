---
name: specwarden
description: Use when adding, changing or debugging a check in a repository that has specwarden — writing a check, deciding which primitive fits, wiring a rule, arming a ratchet, or working out why a check is green when it should not be.
---

# specwarden

A quality-gate engine. A repository declares its rules; specwarden proves which hold.
Every term below is defined once in `glossary.md`, beside this file — read it when a word
here is not obvious, and use the glossary's word, never a synonym, in what you write.

## The failure it exists against

**A check that cannot fail reports success.** Not a red run — a _green_ one, which is
worse, because green is what everyone acts on. Before writing anything here, know the
four shapes:

- a glob or filter that matches nothing and exits 0;
- a command pointed at a path that moved, which runs the rest and exits 0;
- a pattern that stopped matching after a format changed;
- a threshold raised to make a red run green.

## Writing a check

A check is a file at `.specwarden/checks/<family>/<id>.check.mjs` that exports `check`.
No registration, no import anywhere: **a file under `checks/` IS a check.** A file there
exporting no check is a load error, never a skip.

Reach for the narrowest thing that fits:

| Expressing                     | Use                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| a structural rule with no body | `forbidImport`, `forbidPattern`, `mustDeclare`, `pathContract`, `siblingRequired`, `referencesResolve`, `regenerable`, `sourcesAgree` |
| a body of your own             | `defineCheck({ run: ctx => findings })`                                                                                               |
| a function that already exists | `fromResult({ run })` — takes `{ errors }` / `{ failures }` / `{ notes }` unchanged                                                   |
| somebody else's command        | `commandCheck({ cmd })`                                                                                                               |

A primitive ships tested, so a consumer using one writes no test for it.

```js
import { defineCheck, readTracked } from 'specwarden';

// .specwarden/checks/docs/doc-owner.check.mjs
export const check = defineCheck({
  rule: { statement: 'a document names its owner', owner: 'docs/README.md' },
  when: { ending: ['.md'] },
  corpus: { atLeast: 1, why: 'no markdown was found — the pathspec matched nothing.' },
  hint: 'Add an `Owner:` line, or say why the document has none.',
  run: (ctx) => {
    const docs = readTracked(ctx.vcs, ctx.files, '**/*.md');
    return {
      findings: docs
        .filter((d) => !d.text.includes('Owner:'))
        .map((d) => ({ severity: 'error', file: d.file, message: `${d.file} names no owner.` })),
      examined: docs.length,
      unit: 'documents',
    };
  },
});
```

Write only what the engine cannot know. Exported alone, the check takes its file's name
as its `id` (`doc-owner`); a file exporting several names each one. `tier` is `fast`, the
`title` is the rule's statement, and `rule: 'a document names its owner'` — a string — is
that statement, owned by the file that declares it. A written value always wins.

Every factory checks its options when the file loads: a missing required option, a
misspelled one, a wrong type are each an exit 2 naming the file and the option — never a
crash mid-run, and never an option dropped in silence.

## Say what a green run must have looked at

Never optional where it applies:

- **`corpus: { atLeast: n }`** — a run that examined fewer units is a hard failure. The
  body reports what it saw as `examined`.
- **`paths: [...]`** on `commandCheck` — the files the command is pointed at are verified
  before it spawns.
- **`expect` / `refuse`** on `commandCheck` — what the output must contain for a zero exit
  to be believed, and the phrases a tool prints when it silently did nothing. `pnpm
--filter` matching no package is the canonical one.

## Read the world only through `ctx`

`ctx.files`, `ctx.vcs`, `ctx.proc`, `ctx.clock`, `ctx.writer` — gated by the capabilities
the check declares; `read` is the default. A check with no `write` has no writer at all.

**Never reach for the platform's file API directly.** A check that does cannot be run
against a constructed tree, so it cannot be unit-tested, so the first sign it is wrong is
somebody's red CI. And never accept a repository root from outside: it changes when the
caller moves.

## Ratchets, for debt that cannot be paid today

`ratchet: <n>` arms the check at the current measurement — `ratchet: { id, direction, ceiling }`
when the store's key is not the check's id, or the number is a score. It fails on a move in
the wrong direction and never on the debt that already exists.

- a **debt** counts down (`direction: 'down'`, the default) — violations;
- a **score** counts up (`direction: 'up'`) — a coverage percentage, a mutation score.

When the number is not simply the count of error findings, say so with `measured` — and
note that stating it also changes what the findings mean: they become failures, and the
measurement is ratcheted apart from them.

`specwarden check --id <id> --tighten` records a new measurement. Never edit the file to
make a red run green: that is the bar moving, which is the whole failure.

## Every check names the rule it enforces

`orphan-check` fails a check that names no rule — an unattributed check is one nobody can
argue with, relax deliberately, or retire. The rule a new check needs is one of:

- `rule: 'the statement'` on the check — owned by its own file, the usual case;
- `rule: { statement, owner }` — when the rationale is written in a document;
- nothing, for a module's check — it carries the rule it enforces, owned by its package;
  write `rule` to state yours instead;
- nothing on the check, and a rule in `.specwarden/rules.mjs` whose
  `enforcement.enforcedBy` lists the check's id — when several checks share one rule.

`enforcement-resolves` walks the other way: every id a rule's `enforcement` names must be
a registered check or a declared perimeter policy. Rename a check, or a policy, and
the rule that named the old id goes red — rename both together.

The rule register (`.specwarden/rules.mjs`) is for what cannot live on a check: a rule
several checks share, and a rule nothing can check (declared `notMechanizable`, **with a
reason — a reason, never an apology**). Declaring one id in both places is refused at load.

## A check a template left switched off

`init` writes some checks as `<id>.check.mjs.example` and lists them: each needs a fact
only this repository has — a path, a list of names, a threshold — and a check configured
with a guess would be green about nothing. An `.example` file is never loaded.

To switch one on:

1. fill in what its header comment asks for — a line marked REPLACE is a guess, not a
   default; nothing else in the file needs changing;
2. drop the suffix: `git mv <id>.check.mjs.example <id>.check.mjs` — a check reads tracked
   files, so an untracked one is examined by nothing;
3. uncomment its rule in `rules.mjs`, where the template left it under the example's id.
   A module's check is no orphan without it — it carries a rule of its own — but a check
   the engine builds (`fromResult`, `commandCheck`) is red on `orphan-check` until then;
4. `specwarden check --id <id>` — green on the tree, then plant the defect it exists for
   and watch it go red. A check never seen red is a hope.

## The perimeter: what an assistant may not do

A `perimeter.mjs` beside the config exports `policies` — each a `commandPolicy({ id, why, match })` — and
the `perimeter` command evaluates one action against them **before** it runs. It is a
hook, not a check: nothing enforces it until the assistant's hook calls it. For Claude
Code, the `hooks.PreToolUse` entry of the project's `settings.json` under `.claude/` →
`node "$CLAUDE_PROJECT_DIR/node_modules/specwarden/bin/specwarden.mjs" perimeter`.

- A refused action exits 2 with the policy's id, its owner and its `why`. Read the `why`:
  it says what to do **instead**. Do that; do not look for a spelling the matcher misses.
- It **fails open**: a missing file, a malformed payload, a policy that throws — all allow.
  A perimeter that blocks on its own fault halts work wearing the face of a rule.
- A new policy is enforced the moment it is in the file; no registration. Its `why` names
  the alternative — a refusal without one is an obstacle.

## Testing a check

```js
import { errorsOf, runCheck } from 'specwarden';

const verdict = await runCheck(check, { tree: { 'a.md': 'no owner here' }, tracked: ['a.md'] });
```

`runCheck` **awaits** — without it `verdict.ok` is `undefined`, which is falsy, so an
assertion that the check failed passes against a check that never ran. An unconfigured
port throws by name rather than answering, so a test cannot pass against a world nobody
described.

**Write the failing case first.** A check nobody has seen fail is a hope.

## Running

```bash
specwarden check                  # the changed-file filter decides what runs
specwarden check --tier fast
specwarden check <id>             # one check, as --id <id>
specwarden check --all            # ignore relevance
specwarden check --fix            # let a fixable check repair itself
specwarden doctor                 # what is declared, without running any of it
specwarden new <id>               # scaffold a check and its test
```

Exit `0` every check held; `1` the answer is no — a check failed, doctor found a defect, a
plan is not ready; `2` the line, the config or a file could not be used — the message names
the file. In CI, pass
`--base <ref>` for a pull request: without one a CI run checks everything, and says so.
`SPECWARDEN_SKIP` is ignored under CI.

## Refuse to

- write a check that cannot say how much it examined, when the answer is knowable;
- lower a ratchet or a coverage threshold to turn a run green;
- add a check to a CI workflow as a step of its own instead of to `checks/` — two lists drift, and the one that
  runs is not the one that was reviewed;
- give a check a `fix` where the correct content is a judgement rather than derivable.
