# 03 — checks in TypeScript and in JavaScript, one engine, one verdict

**Status:** draft

A consumer writes checks, the config, the rules, the perimeter and their tests in
TypeScript or in JavaScript — mixed in one tree, file by file — and the engine loads, names,
runs and judges both identically. The types then carry the repository's own facts: which
ports a check declared, which rules and tiers exist, which checks a rule may name. A
mistake in any of them is red in the editor, in `.ts` and in `.mjs` alike, before the
first run.

**One release.** Everything here ships together and depends on no other plan. The module
hook it installs is the one `_plans/01-any-language.md` phase 1 extends with resolution;
whichever lands first owns the installer, and the other adds its half.

**Every decision is made** — below, each with what it was chosen over. The measure used for
each: the fewest things a consumer must learn, do by hand, or keep in sync.

## What this plan rests on — measured 2026-09-24, Node 24.9, TypeScript 5.9

**Node strips types itself.** `process.features.typescript` is `"strip"`. A `.check.ts` with
`defineCheck`, `import type`, an interface and a helper imported as `./helper.ts` loaded and
built its check; nothing was printed.

**What fails at load, and what catches it first:**

| Written                             | Node at load                        | `tsc` catches it with  |
| ----------------------------------- | ----------------------------------- | ---------------------- |
| `enum`, `namespace`, param property | `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | `erasableSyntaxOnly`   |
| `import './helper'` (no extension)  | `ERR_MODULE_NOT_FOUND`              | `module: nodenext`     |
| `import { ICheckContext }` (a type) | `does not provide an export named`  | `verbatimModuleSyntax` |

**What the consumer's `package.json` does to a `.ts` file** (never to `.mts`):

| Nearest `package.json` | `.check.ts`                                      | `.check.mts` |
| ---------------------- | ------------------------------------------------ | ------------ |
| none                   | loads                                            | loads        |
| present, no `"type"`   | loads, **prints `MODULE_TYPELESS_PACKAGE_JSON`** | loads        |
| `"type": "commonjs"`   | **fails**: `Unexpected token 'export'`           | loads        |
| `"type": "module"`     | loads                                            | loads        |

This is why the engine has only ever read `.mjs`: its format never depends on the consumer.

**Cost of loading** (three runs): one file `.mjs` 10–18 ms, `.ts` 40–57 ms; fifty files
`.mjs` 340–420 ms, `.ts` 490–590 ms — a one-time 30–40 ms for the stripper, 2–3 ms a file
after it.

**The types can carry the repository's facts — prototyped against a stand-in engine, under
`tsc -p .specwarden`, over `.ts` files and plain `.mjs` files (`checkJs`):**

- A `run` declared with METHOD syntax gets a context narrowed by `capabilities` when
  unannotated, and still accepts a body annotated `(ctx: ICheckContext)` — method
  parameters are checked bivariantly. Narrowing costs no break.
- One register interface holding every fact is circular — the rules name check ids, and the
  check ids were read from the same interface that points at the rules. **One interface per
  fact** is not: reading one never evaluates another.
- Rules and tiers need no generation at all: a register file written once points at
  `typeof import('../rules.ts').rules` and at the config, and TypeScript reads both live.
  Only the list of check ids — file names — must be generated.
- The layers degrade cleanly, each one a strict addition:

| Present under `.specwarden/.types/` | Caught                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| nothing                             | an undeclared port (`ctx.proc` without `exec`, `ctx.writer` without `write`) |
| the static `register.d.ts`          | + a rule id typo (`Did you mean '"no-panic"'?`), an undeclared tier          |
| + the generated `checks.d.ts`       | + an unknown check in a rule's enforcers                                     |

- A type error INSIDE `rules.ts` widens rule ids to `string` elsewhere until it is fixed: the
  error itself is reported, nothing false is — less checking, never a wrong one.

**Today** discovery refuses `*.check.ts` with a rename to `.check.mjs`
(`core/src/runtime/consumer-tree/discover-checks/discover-checks.util.ts`, `MISNAMED`) —
correctly, since a file it cannot load must not be skipped. `.mjs` is assumed in 22 files of
`core/src`. `ICheckContext` hands every port to every check; `gated-context.factory.ts`
throws on an undeclared one, so the rule exists at run time and nowhere in the types.

## Invariants every phase keeps

- **One file, one verdict.** A check in `.ts` and the same check in `.mjs` have the same id,
  title, rule, capabilities and verdict — proved per factory.
- **The engine strips; it never transpiles.** Only erasable syntax runs, on every runtime the
  engine ships on, so nothing loads here that the consumer's own `node` rejects.
- **No silent skip.** A file in a checks folder the engine will not load is a named error
  with its remedy.
- **JavaScript loses nothing.** Every type feature reaches `.mjs` and `.js` through `checkJs`;
  nothing requires TypeScript to be installed, and nothing breaks where it is not.
- **Nothing the consumer wrote breaks.** No published name is removed or narrowed; every
  addition is new.
- **Documentation changes with the behaviour**, in the same phase: `core/GUIDE.md`,
  `core/GLOSSARY.md`, and the skill shipped to consumers' agents.

---

## Phase 1 — every ES module format loads

- **Discovery** reads `**/*.check.{ts,mts,js,mjs}`. `.cjs` and `.cts` are refused with the
  rename: the engine's model is an ES module that exports a check.
- **One rule the consumer can remember: everything under `.specwarden/` is an ES module,
  whatever its extension.** Two mechanisms hold it:
  - `init` writes `.specwarden/package.json` — `{ "type": "module", "private": true }` —
    so Node, `tsc`, `node --test` and every editor agree without being told;
  - the engine's load hook answers the ES module format for any `.ts` or `.js` file under
    the consumer directory, so a tree without that file (older, or deleted) still loads,
    silently correct, and `doctor` names the missing file as the one thing to restore.
- **A check's id is its file name without `.check.<ext>`**, for all four. Two files giving
  one id (`a.check.mjs` beside `a.check.ts`) is a load error naming both.
- **`config`, `rules`, `perimeter`** resolve in the same four extensions, flat or in their
  folder (`resolve-declaration.util.ts`). Two forms of one declaration is a load error naming
  both; the retired-name refusal stays.
- **Node without type stripping** (`process.features.typescript` false, or switched off in
  `NODE_OPTIONS`) with a `.ts` file present: a load error saying so, before any import.
- **Load errors are translated**, each with the file, the line and the `tsconfig` flag that
  would have caught it earlier — the three rows of the first table.
- **The floor version** (`engines.node`) loads a `.ts` check once in this phase: a warning
  printed there is filtered by its code, or the floor is raised — whichever keeps the
  output clean, with the reason beside `engines`.

Watched red first: a core playground case with one `.check.ts` — exit 2, "rename it", today.

Before: `contract-architect` — which files the engine reads is a published fact.

```bash
pnpm --filter specwarden exec vitest run src/runtime/consumer-tree src/runtime/cli/_shared
pnpm --filter specwarden exec vitest run _playground
pnpm gate
```

## Phase 2 — both languages proved identical

- **Parity suite**: every primitive, `commandCheck`, `defineCheck` and `fromResult` declared
  once in `.mjs` and once in `.ts`; identity and verdict must be equal on the same tree, red
  and green.
- **Loader matrix** as a contract spec: each of the four extensions under each of the four
  manifests, with and without `.specwarden/package.json`, loads with nothing on stderr;
  `.cjs` and `.cts` refuse; the three translated errors each fire.
- **Tests in either language**: `*.check.test.ts` beside `*.check.test.mjs`, run by
  `node --test`, which strips types too.
- **The root playground's consumer is mixed** — `.ts` and `.mjs` checks, a `rules.ts` beside
  a `config.mjs` — so every package is proved composed through both.
- **This repository's own `.specwarden/` becomes mixed**: it is the first consumer, and a path
  nobody here runs is a path that rots.

```bash
pnpm --filter specwarden exec vitest run src/primitives src/runtime
pnpm gate --id playgrounds --id package-playgrounds
pnpm gate
```

## Phase 3 — a check's context has only the ports it declared

- **`TCheckContext<C>`**, a type alias following the repository's `T` prefix, computed from
  the capabilities:

| Declared | The context carries                                   |
| -------- | ----------------------------------------------------- |
| always   | `changed`, `shard`, `threshold`, `roster`, `clock`    |
| `read`   | `files`, `vcs` — the default when nothing is declared |
| `exec`   | `proc`                                                |
| `write`  | `writer`                                              |

- **`capabilities` becomes a `const` type parameter of `defineCheck`**, and `run` and `fix`
  are declared as methods taking `TCheckContext<C>`. An unannotated body is narrowed; a body
  annotated `ICheckContext` still compiles, by bivariance, because its author chose the full
  context — and the runtime gate still refuses what was not declared.
- **`ICheckContext` is unchanged**: the full context, what `fromResult`, module internals and
  hand-built contexts use.
- **Helpers take the context they need**: `(ctx: TCheckContext) => …` accepts any check that
  declared at least `read`, so a `_shared/` helper is reusable across checks without
  knowing their capabilities.
- **`testContext` and `runCheck` take the same parameter**, so a test's fake is shaped like the
  check's real context.
- **Type tests** (`vitest --typecheck`, `expectTypeOf`, `@ts-expect-error`) pin every row, the
  default, the annotated case and the helper case.

Before: `contract-architect` — the published signature of the most used factory.

```bash
pnpm --filter specwarden exec vitest run --typecheck src/primitives/define-check src/testing
pnpm gate --id typecheck
pnpm gate
```

## Phase 4 — the repository's names become types, live

- **Three empty exported interfaces**, one per fact, so none is circular with another:
  `IRegisteredRules`, `IRegisteredConfig`, `IRegisteredChecks`.
- **Types read from them, each falling back to today's type when its interface is empty**:
  `TRuleId` (the ids of the registered rules, else `string`), `TCheckId` (else `string`), and
  `TTier` itself — the registered config's `tiers`, else its current definition. No new
  name for tiers: the one everybody already writes becomes exact.
- **Threaded through every place a name is written**: a check's `rule` (an id, or the
  inline object) and `tier`; a rule's enforcers (`TCheckId`); `defineConfig`'s tiers,
  ownership and denied capabilities; `roster()` ids; every module factory, through the shared
  `ICheckDeclaration`.
- **`defineRules`**, an identity with a `const` parameter, so a rules file keeps its ids
  literal; `defineConfig` gains the same, so its tiers do.
- **`init` writes `.specwarden/.types/register.d.ts` once**: it augments `IRegisteredRules`
  with `typeof import('../rules.ts').rules` and `IRegisteredConfig` with the config's
  default export, in whichever extension each has. It never changes afterwards, so it is
  committed and never drifts; a declaration renamed to another extension is caught by the
  `types-current` check of phase 5.

Type tests pin all three layers of the degradation table, and the widening when `rules.ts`
itself has an error.

Before: `contract-architect` — new exported types, and the field types of every declaration.

```bash
pnpm --filter specwarden exec vitest run --typecheck src/domain src/runtime/config
pnpm gate --id typecheck
pnpm gate
```

## Phase 5 — the one generated file

- **`specwarden types` writes `.specwarden/.types/checks.d.ts`**: `IRegisteredChecks` with
  the discovered roster's ids — sorted, one per line, with a generated-file header. It is
  the only fact TypeScript cannot read for itself, because a roster is a directory listing.
- **Regenerated by every command that changes the roster** — `new`, `init`, `migrate`,
  `check --fix` — so a consumer who uses the commands never runs `types` at all.
- **Committed**, and held by a self-check, `types-current`: it runs when `.types/` exists,
  fails when regenerating would change either file, names the command, and is fixable by
  `--fix`. Built on `regenerable`, the engine's primitive for exactly this.
- **Where `specwarden` does not resolve from the repository** (the manifest-less case of plan
  01), `types` also places the engine's declarations, and any bundled module's, under
  `.types/`, with the `paths` entry in the generated `tsconfig` that finds them.
- **`doctor`** reports whether the types are current, and how many checks are in each
  language.

Watched red first: a playground whose `checks.d.ts` still names a renamed check.

Before: `contract-architect` — a new command, a new committed file, a new self-check.

```bash
pnpm --filter specwarden exec vitest run src/runtime/cli src/checks
node core/bin/specwarden.mjs types
pnpm gate
```

## Phase 6 — writing a check starts in the tree's own language

- **`--format ts|mjs`** on `new` and `init` — the same flag
  `_plans/04-checks-without-javascript.md` extends to `toml`, `json`, `py`, `go` and `sh`. Without it, the choice follows what is already there:
  the language most existing checks use; with none, `ts` when the repository has a
  `tsconfig.json` or declares `typescript`; else `mjs`.
- **`new <id>`** writes the check and its test; **`new <id> --factory`** writes a factory
  (phase 7) and its test, for a family of checks.
- **`init --format ts`** writes `config.ts`, `rules.ts`, the checks, `.specwarden/package.json`,
  `.types/` and `.specwarden/tsconfig.json` — its own program, which every editor picks up as
  the nearest config. A root `tsconfig.json` is never edited; when its `include` reaches
  `.specwarden/`, `init` prints the one line that excludes it.
- **Templates render either format** from the same part. A part's body is already valid
  TypeScript; what changes is the extension, the header and the tree's `tsconfig`.
- **The parts suite type-checks what it writes**: every template's tree in `ts` form goes
  through `tsc -p .specwarden` against the real modules' declarations. This lifts, for every
  template at once, the limit `scripts/registry.mjs` records — a template emits strings and
  no compiler reads a string.
- **A `specwarden-typecheck` part**, written only where TypeScript is installed: a
  `commandCheck` running `tsc -p .specwarden`, with `paths` on the `tsconfig` and a `refuse`
  on `TS18003` (no inputs), since `tsc` prints nothing when it succeeds.

Before: `template-author` for the parts and playgrounds; `contract-architect` for the flags.

```bash
node scripts/playgrounds.mjs --write node-ts
pnpm gate --id playgrounds --id package-playgrounds --id scaffold-drift
pnpm gate
```

## Phase 7 — a family of checks, written once and shared

- **`defineFactory({ options, capabilities, run })`** returns a factory whose options are
  validated at load by the spec — `TOptionSpec`, what `checkOptions` already validates with —
  and typed by `InferOptions<typeof spec>`: `regexp` → `RegExp`, `required` → not optional,
  plus the declaration fields every factory takes (`id`, `tier`, `rule`, `when`, `corpus` …).
- **The spec gains what inference needs and nothing more**: an element kind for arrays, a set
  of literals for a string.
- **A preset is a function returning factories' checks** — the shape `plansChecks` already
  has — and needs no API of its own; the guide shows it.
- **Shared across repositories as an ordinary package**: a package exporting factories built
  this way carries its option types, and the consumer's registered rule ids and tiers apply
  to its declarations automatically, because they are global to the program.
- The same spec is what `_plans/04-checks-without-javascript.md` phase 1 publishes as JSON
  Schema; this plan needs nothing from that one.
- Type tests pin the inference; the modules adopt `defineFactory` only where it changes
  nothing they publish.

Before: `contract-architect` — a new published factory, and a spec shape made public.

```bash
pnpm --filter specwarden exec vitest run --typecheck src/primitives/_shared
pnpm gate
```

## Phase 8 — taught where checks are written

- **`core/GUIDE.md`**: both languages side by side on every example; the style table below;
  every load error and its remedy; the three type layers; factories, presets and sharing a
  package of checks.
- **The shipped skill** (`core/skills/specwarden/SKILL.md`) teaches a consumer's agent the
  same, since an agent writes most new checks and reads the skill, not the guide.
- **`core/GLOSSARY.md`** defines each new term once; the `vocabulary` check learns any
  retired spelling that appears while they are written.

```bash
pnpm gate --id skills --id docs --id vocabulary
pnpm gate
```

---

## The style a consumer's check follows

| Rule                                                                      | Held by                                   |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| one check per file; its name is its id; `export const check`              | discovery                                 |
| a family shares a factory; a helper lives in `_shared/`, never discovered | discovery, `new --factory`                |
| everything under `.specwarden/` is an ES module                           | `.specwarden/package.json`, the load hook |
| relative imports carry their extension: `./x.ts`, `./x.mjs`               | `module: nodenext`, the loader            |
| types are imported as types                                               | `verbatimModuleSyntax`                    |
| erasable syntax only — a union or an `as const` object, never `enum`      | `erasableSyntaxOnly`, the loader          |
| capabilities are declared; the context is not annotated                   | phase 3's types                           |
| a rule is named by its id, never restated                                 | phase 4's types                           |
| a check's test sits beside it, in its language                            | `new`                                     |

The generated `.specwarden/tsconfig.json`: `module` and `moduleResolution` `nodenext`,
`target` `ES2023`, `strict`, `noEmit`, `allowJs`, `checkJs`, `allowImportingTsExtensions`,
`verbatimModuleSyntax`, `erasableSyntaxOnly` (TypeScript 5.8 or newer — `init` says what goes
unchecked on an older one), `types: []`; it includes the four extensions and `.types/`.

Code written in `core` for this plan follows `skills/typescript/SKILL.md` like everything
there, and each new refusal carries its reason in its docblock, as `MISNAMED` does today.

## How it is proved

- **Unit specs** beside each unit: discovery, declaration resolution, the hook, error
  translation, `types`, `new`, `init`.
- **Contract spec**: the loader matrix (phase 2).
- **Parity suite**: every factory in both languages (phase 2).
- **Type tests** under `vitest --typecheck` (phases 3, 4, 7) — the only honest test of a type
  is the compiler rejecting what it must.
- **Playgrounds**: the root consumer mixed; every template's `ts` form type-checked.
- **Self-check** `types-current` on this repository and on every playground.
- **Seen red** before believed: each phase names its first red.

## The release

One version, one changeset per consumer-visible phase. `specwarden` minor: new formats, new
types, a new command and self-check, nothing removed or narrowed. `@specwarden/scaffold-parts`
and every template minor: the `ts` format and the typecheck part. The modules: no change to
what they publish. `release-manager` checks the changesets against the diff;
`adversarial-reviewer` reads the whole before it is cut.

---

## Decisions

### Decision: Node's own type stripping, no transpiler

- Rejected: bundling esbuild, swc, `tsx` or `jiti` — core depends on nothing, and a
  transpiler accepts `enum` and friends, so a check would load here and fail under the
  consumer's own `node --test`.

### Decision: `.ts`, `.mts`, `.js`, `.mjs` load; `.cjs`, `.cts` refuse

- Rejected: `.mjs` and `.mts` only — a TypeScript author writes `.ts` and a JavaScript author
  writes `.js` first; once the format is fixed by the engine, refusing them only teaches a
  rename.
- Rejected: loading CommonJS — a check is an ES module export, and a second module system
  doubles the loader for a format nobody starts a new file in.

### Decision: `.specwarden/` is an ES module scope, stated by a file and held by the hook

- Rejected: requiring `"type": "module"` in the consumer's manifest — it describes their code,
  and a CommonJS project should not flip it for a tool.
- Rejected: the hook alone — Node would agree, but `tsc`, `node --test` and the editor would
  each read the consumer's manifest and disagree about the same file.
- Rejected: the marker file alone — deleting one small file would turn every check into a
  load error; the hook keeps it a note in `doctor`.

### Decision: erasable syntax only, on every runtime

- Rejected: allowing what a runtime can transpile (Bun can) — one file would have two
  verdicts by where it ran. For the standalone binary of `_plans/01-any-language.md` phase 6,
  that makes Node's single executable the runtime that meets this plan.

### Decision: the engine never type-checks during a run

- Rejected: running `tsc` in `check` — seconds on every run, a duplicate of the consumer's CI,
  and a type error is not a verdict on their code; the `specwarden-typecheck` part wraps it
  wherever they want it.

### Decision: narrowing through a method signature, not a break

- Rejected: a breaking change with a migration of `(ctx: ICheckContext)` annotations — the
  bivariant method gives the narrowing to every unannotated body and breaks nobody.
- Rejected: overloads — every mistake would read "No overload matches this call".

### Decision: one register interface per fact, rules and tiers read live

- Rejected: one `Register` interface — measured circular: the rules name check ids read from
  the interface that points at the rules.
- Rejected: generating rule ids and tiers — TypeScript reads them from the files themselves,
  so a generated copy could only lag behind them.
- Rejected: a generated module to import from — two import paths for one API, and every
  `.mjs` file would have to know it.

### Decision: the generated file is committed, and regenerated by the commands

- Rejected: gitignoring it — a fresh clone and every CI job would type-check enforcers as
  plain strings until somebody ran a command nobody remembers.
- Rejected: asking the consumer to run `types` — every command that changes the roster
  already knows it did.

### Decision: `TTier` becomes exact rather than a new tier type

- Rejected: a `TTierName` beside `TTier` — two names for one concept, and everybody already
  writes `TTier`.

### Decision: one `--format` flag, defaulting to what the tree already is

- Rejected: `--lang` beside `init`'s `--format` — what a file is written in is one axis.
- Rejected: a fixed default — a TypeScript repository handed an `.mjs` file, or the reverse,
  learns the tool did not look.

### Decision: `defineFactory` over the existing option spec

- Rejected: a second, type-first schema — the spec already validates every factory at load,
  and two descriptions of one option set are two chances to disagree.

## Risks this plan carries

- Node's type stripping is recent: a playground case per row of the matrices pins it, so a
  Node change is a red run rather than a consumer's surprise.
- `erasableSyntaxOnly` needs TypeScript 5.8; an older compiler gets a `tsconfig` without it
  and a line from `init` saying what is then unchecked.
- A check over `**/package.json` in the consumer's own tree sees `.specwarden/package.json`;
  it is `private`, unnamed and has no dependencies, and the guide says so.
- `checks.d.ts` can conflict in a merge; sorted, one id per line, it is resolved by
  regenerating, and `types-current` confirms it.

## Harvest

| Fact                                                                        | Goes to                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| which extensions load, which refuse, and why                                | docblock of discovery; `core/GUIDE.md` §2                            |
| `.specwarden/` is an ES module scope; the marker and the hook, and why both | docblock of the load hook; `core/GUIDE.md` §2                        |
| the `package.json` matrix                                                   | docblock of the load hook                                            |
| erasable syntax only, on every runtime, and why                             | `core/SKILL.md`; `core/GUIDE.md`                                     |
| the capability → port table; narrowing by a bivariant method                | docblock of `TCheckContext`; `core/GUIDE.md` §3                      |
| one register interface per fact — the circularity that forced it            | docblock of the register interfaces                                  |
| the three type layers and the widening on an error in `rules.ts`            | `core/GUIDE.md`                                                      |
| the generated file is committed and regenerated by the commands             | docblock of `types-current`; `core/GUIDE.md`                         |
| the consumer style table and the generated `tsconfig`                       | `core/GUIDE.md`; `core/skills/specwarden/SKILL.md`                   |
| a template's output is type-checked — the old limit is gone                 | the comment in `scripts/registry.mjs`; `skills/playgrounds/SKILL.md` |
| the load-cost measurement                                                   | the phase 1 commit message                                           |
| each consumer-visible phase                                                 | its changeset                                                        |
