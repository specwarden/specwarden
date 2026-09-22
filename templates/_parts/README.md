# specwarden-scaffold-parts

The pieces a template is assembled from. One check per part: the file that configures it,
the rule that file enforces, and — where one is needed — the config field that makes the
two resolve.

## Why it exists

Five templates emitted the same credential scan four times and the same doc-path check
five times. Copy-paste in GENERATED PROSE is worse than copy-paste in code: nothing
typechecks it, so the day a module option is renamed, four of the five copies get fixed
and the fifth writes a tree that throws on its first run — the run that decides whether
the tool is kept.

So the shared piece lives here once, and a template goes back to being a list of
DECISIONS: which checks a repository of its kind wants on day one, which options keep
them from being noisy, and which to leave out.

## What a part is

```ts
export const secretScanPart = (ctx: ITemplateContext, o: IPartOptions = {}): IPart => ({
  files: [{ path: 'checks/security/secret-scan.check.mjs', body: `…` }],
  rules: [{ id: 'no-credentials-in-tree', statement: '…', owner: '', enforcement: { checkIds: ['secret-scan'] } }],
});
```

`compose(...parts)` merges them in order and REFUSES two parts writing one path: whichever
way a merge resolved that, one of the two configurations would be silently gone.

Three rules hold across every part, and each is pinned by a test in `src/parts.spec.ts`:

- **A part carries its own rule.** A check registered without one is an orphan, and
  `orphan-check` fails the tier for it — a shared emitter that left the rule to the caller
  would hand every template the same trap.
- **An `.example` part declares NO rule.** Its file is not loaded until somebody renames
  it, and a rule naming an unregistered check fails `enforcement-resolves` on the tree the
  scaffold just wrote: the harness reporting its own output as a defect.
- **A part whose subject does not exist writes nothing.** No compose file, no env-file
  check. No workflow, no CI-coverage check. No tracked shell, no shell check. No `lint`
  script, no lint wrapper. Written blind, each is a red first run for a reason that has
  nothing to do with the repository's code.

## Why the prose is overridable

`IPartOptions.header` replaces the first paragraph of the generated file's header, and it
is not decoration. Why a check earns its place differs per repository: a dead documentation
path is an inconvenience in a library and a wrong action taken confidently in a repository
that agents work in. The generated file is where that reason has to live, because it is the
file somebody reads six months later while deciding whether to delete the check.

## What it is not

Not a dependency of anything `init` writes. A generated check imports the MODULE it
configures (`specwarden-module-docs`, …) directly, so a repository can delete every
specwarden template package the day after `init` and lose nothing. This package is a
build-time dependency of the templates and of nothing else.
