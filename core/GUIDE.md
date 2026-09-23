# specwarden — guide

A repository declares its rules; the warden proves which hold.

This is the engine end to end: adopting it, writing a check, the eight primitives, the
things that make a check unable to pass quietly, the CLI, and the ports you can replace.

---

## 1. Start

```bash
pnpm add -D specwarden
npx specwarden adopt      # what this repository already is
npx specwarden suggest    # rules it already follows, each armed at today's reality
npx specwarden init       # write the starting tree
```

`adopt` reports; `suggest` proposes and enables nothing; `init` writes. In that order,
because a harness that arrives with opinions about a repository it has not read is one
that gets deleted.

`init --template <name>` starts from a shape: `node-ts`, `docs-only`, `monorepo`,
`nestjs`, `agentic`, `ops`, `openspec`, `speckit`. A template writes a part only where
its subject exists.

## 2. The tree

```
.specwarden/
  warden.config.mjs   the ENTRY — only what the tree cannot say for itself
  rules.mjs           what this repository has decided, and who owns each decision
  checks/             one file per check, by family; the engine discovers them
  perimeter.mjs       what an assistant may not do here (optional)
  relevance.mjs       which paths a gate cares about (optional)
  ratchets/           DATA, written by --tighten — commit it
  baseline/           DATA — same reasoning
```

Checks are discovered under `checks/` at any depth. A check does not have to be named in
the config, and naming every one of them there is available (`autoload: false`) at the
cost of the forgotten-import failure.

Any declaration may instead live in its own folder with its test — a `perimeter` folder
holding `perimeter.mjs` beside `perimeter.test.mjs`. The engine resolves both layouts.

## 3. A check

```js
import { defineCheck } from 'specwarden';

export const checks = [
  defineCheck({
    id: 'no-todo-in-src',
    title: 'no TODO left in shipped source',
    tier: 'fast',
    when: { under: ['src/'] },
    corpus: { atLeast: 1, why: 'src/ was empty — the pathspec stopped matching' },
    run: (ctx) => {
      const files = ctx.vcs.trackedFiles('src/**/*.ts');
      return {
        findings: files
          .filter((f) => ctx.files.read(f).includes('TODO'))
          .map((f) => ({ severity: 'error', file: f, message: `${f} — TODO in shipped source.` })),
        examined: files.length,
        unit: 'file(s)',
      };
    },
  }),
];
```

`defineCheck` owns the verdict: it assembles findings, stamps each one with the rule it
proves, writes the pass note that says what was examined, and enforces the corpus floor.
A body returns findings and never builds a verdict, so a ratchet means the same thing in
every check.

**The body never touches the world directly.** `ctx.files`, `ctx.vcs`, `ctx.proc`,
`ctx.clock`, `ctx.writer` are ports, and the engine gates each one on a declared
capability. That is what makes a check testable against a described repository rather
than the machine it happens to be on — and what makes installing somebody else's check
something other than running arbitrary code in your pre-push.

Scaffold one with its test:

```bash
npx specwarden new no-todo-in-src --family hygiene
```

## 4. The eight primitives

A structural rule is one line, and each is already tested as part of the product, so a
consumer never tests its own rules.

| Primitive           | Says                                                    |
| ------------------- | ------------------------------------------------------- |
| `forbidImport`      | files under X may not import Y (with exceptions)        |
| `forbidPattern`     | this pattern does not appear in this corpus             |
| `pathContract`      | a file of this kind lives only in these places          |
| `siblingRequired`   | a file of this kind has a sibling of that kind          |
| `mustDeclare`       | these fields are present and non-empty                  |
| `referencesResolve` | every reference of this shape points at something real  |
| `regenerable`       | a generated file equals what its generator produces now |
| `sourcesAgree`      | two sources of one fact say the same thing              |

Plus `fromResult`, which wraps a script that already returns a list of human strings, and
`commandCheck`, which wraps a command line.

## 5. What stops a check passing quietly

This is the whole product, and it is worth reading even if nothing else here is.

**`corpus: { atLeast: n, why }`.** Every silent-success defect on record has one shape: a
path filter that matched no file, a package filter that matched no package, a pattern
that stopped matching after a format changed. In each case the check ran, examined
nothing, found nothing wrong, and reported green — for months. The number is usually
obvious, and stating it turns the entire family from invisible into loud.

**An unknowable diff runs everything.** A range that cannot be read is not "nothing
changed": read that way, a shallow clone or a first push skips the whole tier.

**`measured`.** When several findings summarise one total, say the total. Counting
printed error lines instead would have rewritten thresholds of 17 and 37 down to 0 under
`--tighten` — a command whose whole purpose is to record the truth, recording a fiction.

**A skip that reaches the arbiter is a hole.** `SPECWARDEN_SKIP` is honoured locally and
ignored under CI.

**A duplicate check id throws.** The alternative is a check silently unreachable by
`--id`.

## 6. Ratchets

A ratchet arms a rule against a tree that cannot satisfy it today.

```bash
specwarden check --tighten     # lower each threshold to today's count
```

`direction: 'down'` is a debt count (the default); `'up'` is a floor a score must stay
above. Commit `.specwarden/ratchets/` — it is data, and the next run compares against it.

Never run `--tighten` in a pre-push hook: a check that under-counted once would pin an
unreachable target and fail forever.

## 7. Every day

```bash
specwarden check                      # the relevant checks for this diff
specwarden check --tier fast          # a schedule
specwarden check --id doc-paths       # one gate, for a CI job
specwarden check --all                # ignore relevance
specwarden check --list               # the manifest, in run order
specwarden check --jobs 4             # overlap; a check that cannot share declares exclusive
specwarden check --fix                # repair what is derivable, then re-run
specwarden doctor                     # what is declared, without running any of it
```

`--reporter tty|json|github`. A reporter never prints the value of an environment
variable: a finding names what is wrong, not the secret behind it.

## 8. Rules and coverage

```js
// .specwarden/rules.mjs
export const rules = [
  {
    id: 'reviews-before-merge',
    statement: 'Every change to main is reviewed by someone who did not write it.',
    owner: 'CONTRIBUTING.md',
    enforcement: { notMechanizable: 'Enforced by branch protection in the forge, not here.' },
  },
];
```

A rule with no enforcer is allowed **when it declares why** — that is what separates "we
never got to it" from "this cannot be automated". An enforcer with no rule is a defect,
and the harness's own checks report both.

A check may declare its rule beside it, rather than in a register kept in step by hand.

## 9. Replacing a port

The engine is ports-and-adapters, and the adapters are replaceable:

```js
export default defineConfig({
  adapters: (defaults, { root }) => ({ ratchets: new RedisRatchetStore(url) }),
  reporter: ({ json, out }) => new SarifReporter(out),
});
```

You receive the defaults and return only what changes. What the built-ins assume is
ordinary and often wrong somewhere — that history is git, that a ratchet is a JSON file
on this disk, that "now" is the system clock.

## 10. Testing a check

The testing kit ships with the engine, because a tool whose central promise is
testability has to make the test the easy path.

```js
import { errorsOf, runCheck, testContext, uncoveredFactories } from 'specwarden';

const verdict = await runCheck(myCheck, { tree: { 'src/a.ts': '// TODO\n' } });
expect(verdict.ok).toBe(false);
expect(errorsOf(verdict).join(' ')).toContain('src/a.ts');
```

An unconfigured port **throws by name**, saying which port was reached for and which
option supplies it — a fake that quietly answers "no files" turns a test of a check into
a test of an empty repository.

`runCheck` awaits. A check may be async, and `check.run(ctx)` without an await returns a
promise whose `ok` is `undefined` — which is falsy, so an assertion that the check FAILED
passes against a check that never ran.

Run every check twice: over a clean tree and a broken one. A check returning the same
verdict for both cannot fail, and one that cannot fail reports success.

## 11. Modules and plugins

The engine carries only what is true of any repository. Everything else ships separately
and is installed by choice:

`@specwarden/docs`, `@specwarden/plans`, `@specwarden/ops`, `@specwarden/security`,
`@specwarden/agents`, `@specwarden/openspec`, `@specwarden/speckit`,
`@specwarden/plugin-nestjs`.

The test is the one the zone boundary applies: if a check could be WRONG about a
repository that has never heard of it, it is an opinion and it ships separately.
