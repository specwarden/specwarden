<!-- GENERATED from core/GUIDE.md. Edit the guide. -->

# specwarden — guide

A repository declares its rules; specwarden proves which hold.

This is the engine end to end: adopting it, writing a check, the eight primitives, the
things that make a check unable to pass quietly, the CLI, and the ports you can replace.
Every term it uses is defined once, in [`GLOSSARY.md`](https://github.com/specwarden/specwarden/blob/main/core/GLOSSARY.md).

---

## 1. Start

```bash
pnpm add -D specwarden
npx specwarden adopt      # what this repository already is
npx specwarden suggest    # rules it already follows, each armed at today's reality
npx specwarden init       # write the starting tree
```

`adopt` reports; `suggest` proposes and enables nothing; `init` writes. In that order,
because a tool that arrives with opinions about a repository it has not read is one
that gets deleted.

`init --template <name>` starts from a shape: `node-ts`, `docs-only`, `monorepo`,
`nestjs`, `agentic`, `ops`, `openspec`, `speckit`. A template writes a part only where
its subject exists.

## 2. The tree

```
.specwarden/
  config.mjs          the ENTRY — only what the tree cannot say for itself
  rules.mjs           what this repository has decided, and who owns each decision
  checks/             one file per check, by family; the engine discovers them
  perimeter.mjs       what an assistant may not do here (optional)
  ratchets/           DATA, written by --tighten — commit it
```

Checks are discovered under `checks/` at any depth. A check does not have to be named in
the config, and naming every one of them there is available (`autoload: false`) at the
cost of the forgotten-import failure.

Any declaration may instead live in its own folder with its test — a `perimeter` folder
holding `perimeter.mjs` beside `perimeter.test.mjs`. The engine resolves both layouts.

## 3. A check

```js
// .specwarden/checks/hygiene/no-todo-in-src.check.mjs
import { defineCheck } from 'specwarden';

export const check = defineCheck({
  rule: 'no TODO left in shipped source',
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
});
```

A check says only what the engine cannot know. Exported alone from its file, it takes the
file's name as its `id` — `no-todo-in-src`; a file exporting several names each one. The
`tier` is `fast`, the `title` is the rule's statement, and a `rule` written as a string
is that statement, owned by the file that declares it. Any of them may still be written,
and a written one wins.

`defineCheck` owns the verdict: it assembles findings, stamps each one with the rule it
proves, writes the pass note that says what was examined, and enforces the corpus floor.
A body returns findings and never builds a verdict, so a ratchet means the same thing in
every check.

**The body never touches the world directly.** `ctx.files`, `ctx.vcs`, `ctx.proc`,
`ctx.clock`, `ctx.writer` are ports, and each one opens only to a check that declares
its capability. That is what makes a check testable against a described repository rather
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

**A command says what it was pointed at, and what proves it ran.** A bare `commandCheck`
believes the exit code, and a tool pointed at nothing usually exits 0: `grep` over a glob
that matched no file complains on stderr and the check passes, the complaint an info line.

```js
export const check = commandCheck({
  cmd: 'node --test --test-reporter=tap "tests/**/*.test.mjs"',
  rule: 'every test passes',
  paths: ['tests/'], // verified before the command spawns
  expect: [/^# pass [1-9]/m], // a zero exit is believed only beside this
  refuse: [/No such file or directory/], // what the tool prints when it did nothing
});
```

A command runs at the repository root wherever the CLI was invoked from. A package's own
suite in a monorepo says where it lives — `cwd: 'packages/api'` — and that directory is
verified before the command spawns, as `paths` are. `cwd` stays inside the repository (an
absolute path or `..` is refused when the file loads), and `paths` stay relative to the
root whatever `cwd` says. Colour codes a tool prints under
`FORCE_COLOR` are stripped before `expect` and `refuse` read the output.

**A check that could not look says so.** What it examines may not be on this machine —
gitignored env files on a CI runner. A `defineCheck` body returns `skipped: 'why'`, and the
run reports the check as skipped (`cannot-tell`), counted with the skips: never a pass,
never a failure, and never a measurement for `--tighten`. A body that also reports a defect
did look, and is judged on it.

**An unknowable diff runs everything.** A range that cannot be read is not "nothing
changed": read that way, a shallow clone or a first push skips the whole tier. Under CI
with no `--base`, the range of unpushed commits is empty by construction — the commit is
already pushed — and it is read the same way: everything runs, and the run says why. Pass
`--base <ref>` for the narrower run.

**`measured`.** When several findings summarise one total, say the total. Counting
printed error lines instead would have rewritten thresholds of 17 and 37 down to 0 under
`--tighten` — a command whose whole purpose is to record the truth, recording a fiction.

**A skip that reaches CI is a hole.** `SPECWARDEN_SKIP` is honoured locally and
ignored under CI.

**A duplicate check id throws.** The alternative is a check silently unreachable by
`--id`.

## 6. Ratchets

A ratchet arms a rule against a tree that cannot satisfy it today.

```bash
specwarden check --tighten     # lower each threshold to today's count
```

`direction: 'down'` is a debt count (the default); `direction: 'up'` is a score that may
only rise, failing below its threshold. Commit `.specwarden/ratchets/` — it is data, and the next run compares against it.

`--tighten` records only what a passing run measured, and never past the ceiling a check
declares with `ratchet`: a red run's count is the regression, not a new bar.

Never run `--tighten` in a pre-push hook: a check that under-counted once would pin an
unreachable target and fail forever.

## 7. Every day

```bash
specwarden check                      # the relevant checks for this diff
specwarden check --tier fast          # one tier
specwarden check doc-paths            # one check, for a CI job — the same as --id doc-paths
specwarden check --all                # ignore relevance
specwarden check --list               # the manifest, in run order
specwarden check --jobs 4             # overlap; a check that cannot share declares exclusive
specwarden check --fix                # repair what is derivable, then re-run
specwarden doctor                     # what is declared, without running any of it
specwarden doctor --json              # the same, as one document for a script; `version` names its shape
```

`--reporter tty|json|github`; `--json` is `--reporter json`, and every JSON document the
command line prints carries `version`. A value flag takes `--flag value` or `--flag=value`,
and a flag belongs to one command — `--fix` on `doctor` is refused, not ignored. A reporter
never prints the value of an environment variable: a finding names what is wrong, not the
secret behind it.

### Exit codes

`0` every check held, or the question was answered. `1` the answer is no: a check failed,
`doctor` found a defect, a plan is not ready to archive. `2` the line, the config or a file
could not be used: an unknown flag, a config that does not parse, a check file that throws,
a tier outside the vocabulary, two checks with one id, `new` over a file that exists. A
refusal goes to stderr, one sentence ending with a period; a load error names its file.

### Environment

| Variable           | Effect                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| `CI`               | a CI run — anything but empty, `false` or `0`                            |
| `GITHUB_ACTIONS`   | a CI run, and the reporter defaults to `github`                          |
| `SPECWARDEN_BASE`  | the ref a change is measured from, as `--base`                           |
| `SPECWARDEN_ALL=1` | ignore relevance, as `--all`                                             |
| `SPECWARDEN_SKIP`  | ids to skip, comma-separated, or `all` — honoured locally, ignored in CI |
| `SPECWARDEN_SHELL` | the shell a command check and a plan acceptance run under                |

Without `SPECWARDEN_SHELL`, a command runs under `bash` — on Windows the Git bash beside
`git`, never the `bash.exe` that starts WSL.

### In CI

- **Annotations are automatic** under GitHub Actions: the `github` reporter writes each
  finding as an annotation on the diff. `--reporter` overrides it.
- **A pull-request run passes `--base`** — `--base origin/main`, or `SPECWARDEN_BASE`.
  Without one, a CI run is a full run: the commit is already pushed, so "unpushed commits"
  is empty by construction, and an empty range read as "nothing changed" would skip the
  tier. The run says so, on stderr when the reporter writes machine output.
- **One job per tier** is the parallelism: `check --tier fast` and `check --tier heavy`
  as two jobs, or `--id <id>` per job for a check with its own setup, with
  `check --relevance --id <id>` deciding whether that setup is needed at all. A job for a
  tier that holds no check is refused, exit 2 — a green job over nothing is the one this
  product exists against — so a tier's job arrives with its first check.
- **`--shard i/N` is not a split of the roster.** It is forwarded to a check that shards
  its own work — a `commandCheck` declared `shardable: true` gets `--shard=i/N` appended. Splitting the roster as well would halve that check's
  input twice.

### Plans

`specwarden plan status <file>` lists a plan's phases and the acceptance each declares;
`--verify` runs every acceptance and prints the output of a red one.
`plan archive <file>` answers no, exit 1, until the plan declares its harvest and every
destination resolves; it never moves the file — `git mv` does, in a reviewable commit.

A plan declares `**Status:**` — `draft`, `active` or `done` — and each
`## Phase N — title` declares its acceptance as an `**Acceptance.**` line or a fenced
`bash` block under the heading, whichever comes first. The keywords are English; a plan
written otherwise is checked by `@specwarden/plans`, with the patterns it supplies.

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
and the self-checks report both.

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
