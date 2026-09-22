---
name: specwarden
description: Use when adding, changing or debugging a quality gate in a repository that has specwarden — writing a check, deciding which primitive fits, wiring a rule, arming a ratchet, or working out why a gate is green when it should not be.
---

# specwarden

A quality-gate engine. A repository declares its rules; the engine proves which hold.

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
No registration, no import anywhere: **a file under `checks/` IS a gate.** A file there
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

export const check = defineCheck({
  id: 'doc-owner',
  title: 'every document names who owns it',
  tier: 'fast',
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

`ratchetId` plus an inline `ratchet: <n>` arms the check at the current measurement. It
fails on a move in the wrong direction and never on the debt that already exists.

- a **debt** counts down (`direction: 'down'`, the default) — violations;
- a **floor** counts up (`direction: 'up'`) — a score, a coverage percentage.

When the number is not simply the count of error findings, say so with `measured` — and
note that stating it also changes what the findings mean: they become failures, and the
measurement is ratcheted apart from them.

`specwarden check --id <gate> --tighten` records a new measurement. Never edit the file to
make a red run green: that is the bar moving, which is the whole failure.

## Every check names the rule it enforces

`rule: { statement, owner }` on the check. `orphan-check` fails a check that names none —
an unattributed check is one nobody can argue with, relax deliberately, or retire.

The rule register (`.specwarden/rules.mjs`) is for what cannot live on a check: a rule
several checks share, and a rule nothing can check (declared `notMechanizable`, **with a
reason — a reason, never an apology**). Declaring one id in both places is refused at load.

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
specwarden check --id <gate>
specwarden check --all            # ignore relevance
specwarden check --fix            # let a fixable gate repair itself
specwarden doctor                 # what is declared, without running any of it
specwarden new <id>               # scaffold a check and its test
```

## Refuse to

- write a check that cannot say how much it examined, when the answer is knowable;
- lower a ratchet or a coverage threshold to turn a run green;
- add a gate to a CI workflow instead of to `checks/` — two lists drift, and the one that
  runs is not the one that was reviewed;
- give a check a `fix` where the correct content is a judgement rather than derivable.
