---
name: typescript
description: The language settings in force across every package, and what each one forbids.
---

# typescript

Every package extends `tsconfig.base.json` and adds only its `rootDir`, `outDir` and
`include`. That is what makes "the same TypeScript everywhere" a fact rather than
eighteen manifests that happen to agree today.

## What the settings forbid

| Setting                                 | Forbids                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `strict`                                | an implicit `any`, an unchecked `null`, a `this` nobody typed                      |
| `noUnusedLocals` / `noUnusedParameters` | a binding left behind by a refactor — where a half-finished change hides           |
| `noFallthroughCasesInSwitch`            | the accidental fallthrough; the deliberate one is written with a comment           |
| `noUncheckedSideEffectImports`          | importing a module that does not exist, when nothing is read from it               |
| `isolatedModules`                       | a construct a bundler cannot transpile file by file — which is what the build does |
| `moduleDetection: force`                | a file that is a script rather than a module by accident                           |

## No DOM

`lib` is `ES2023` and nothing else; `types` is `node`. The engine is a node tool: a check
reads files, spawns processes and returns a verdict. Anything reaching for a browser
global here is a mistake the type system should make immediately, rather than at the
moment somebody runs it in CI.

## Declarations come from the build, not from `tsc`

`tsc` emits relative specifiers exactly as written — without extensions — and node's ESM
loader cannot resolve them. The build is therefore a bundler, and `typecheck` runs `tsc
--noEmit`: one answers "is this correct", the other produces what ships, and neither does
the other's job.

## Specs are excluded from every program

They must not reach `dist`, so they are outside `include`. `tsc` therefore does not check
them, and lint relaxes `no-explicit-any` there — a fixture-driven spec needs shapes a
production file must not have.
