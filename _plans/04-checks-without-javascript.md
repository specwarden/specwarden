# 04 — checks without JavaScript: as data, in Python, in Go, in shell

**Status:** draft

A team whose repository is Go, Python or C++ — and who knows neither TypeScript nor
JavaScript — uses specwarden fully. Most rules are **data**: a `.check.toml` naming one of
the engine's factories. A rule that needs logic is written **in their own language**: a
`.check.py`, a `.check.go` or a `.check.sh`, beside the data files, with the same identity,
the same rule, the same corpus floor and the same verdict as a check written in `.ts`. A
tool they already run — `go vet`, `ruff`, `clang-tidy` — is wrapped so that each of its
findings is a finding here, one per file and line.

**One release, after plans 01, 02 and 03.** It uses plan 01's `specwarden test`, standalone
binary and PyPI channel; plan 02's NUL-safe listing, process-tree kill, test-repository
helper and listing cache; plan 03's discovery by extension, `--format`, `specwarden types`
and `defineFactory`. It takes over what plan 01 had sketched for this — the findings
protocol and the JSON and TOML formats — so that one plan owns the whole of "a check
without JavaScript".

**Every decision is made**, each below with what it was chosen over; the measure for each
is the fewest things a Go or Python author must learn, install, or keep in sync.

## What this plan rests on — measured 2026-09-24, Windows, Go 1.27.0, git 2.45.1

- **The engine is language-neutral already.** In a scratch Go repository, `forbidPattern`
  over `**/*.go` caught `panic(` and `commandCheck` ran `go vet ./...` (plan 01's
  measurements).
- **Go checks can live as single files.** Two `package main` files, each marked
  `//go:build ignore`, in one directory of a nested `.specwarden/go.mod` module: each ran
  alone with `go run <file>`, each was tested alone with `go test <file> <file>_test.go`,
  and the consumer's own `go vet ./...` and `go build ./...` at the root ignored them.
  A `go.work` at the root did not interfere.
- **`go run` reads every argument ending in `.go` as another source file**: given
  `check.go` and then `x.go`, it compiled `x.go`. A corpus can never be passed to a Go check
  in argv.
- **Go start-up**: `go build` of a check 0.2–0.9 s; the built binary 40–75 ms per run, its
  very first run 0.4 s (Windows scanning a new executable); `go run` with a warm cache
  still 0.3–0.7 s, every run.
- **A Python on `PATH` is not a working Python.** On this machine `python3`, `python` and
  `py -3` all resolve, and all fail — they point at a removed `C:\Python312`. No working
  Python exists here, so the Python path is designed from its specification and proved in
  CI, not on this machine.
- **bash and CRLF**: a script checked out with CRLF did not fail — `echo ok\r` printed `ok`
  with an invisible carriage return, so a path it printed would name a file ending in
  `\r`. A silent wrong, not an error.
- **bash start-up on Windows** 48–63 ms; each external command inside a script about 20 ms
  more; `node -e 0` 66–79 ms for scale.
- **A NUL-separated list survives bash**: `cmd/паника.go` and `docs/a b.md` read back
  intact through `read -r -d ''`.
- **`git grep` has no `--pathspec-from-file`** in 2.45 — the one-process idiom it would have
  given does not exist.
- **The portable idiom does** — the one-line shell check shown below, `xargs -0` handing the
  list to `sh -c` around one `grep`: it exits 0 with matches, 0 with none, and 123 when
  grep itself fails (a missing file), and kept `паника.go` and `a [1].go` intact. It prints
  `path:line:text`, with no space after the colon.
- `JSON.parse` keeps the last of two equal keys without a word — a silent override in a
  data file.

---

## The model: one check, however it is written

Every form compiles, at load, to a call of a published factory — so every guarantee is the
factory's, and none is re-implemented per language.

| Form   | Files                                     | Compiles to                 | Logic runs         | Declared by               |
| ------ | ----------------------------------------- | --------------------------- | ------------------ | ------------------------- |
| code   | `.check.{ts,mts,js,mjs}` (plan 03)        | itself                      | in the engine      | the module's exports      |
| data   | `.check.toml`, `.check.json`              | the factory its `use` names | in the engine      | the file                  |
| script | `.check.py`, `.check.go`, `.check.sh`     | `scriptCheck`               | in its own process | a `/// specwarden` header |
| tool   | `.check.toml` with `use = "commandCheck"` | `commandCheck`              | the tool's process | the file                  |

`scriptCheck` is exported like every other factory, so a `.ts` config can wrap a Python
check with a function-valued `when`: the code forms can do everything the others can,
because the others are made of them.

### One declaration schema

Every data file, every script header and every factory's options are **one schema**,
generated from the factories' own option specs:

- **Keys are the factories' option names, verbatim** — `timeoutSec`, `atLeast`, `except` —
  in TOML, in JSON and in headers, so the guide, the types and the schema never translate.
- **Identity keys**, valid everywhere: `id` (default: the file's name), `title`, `rule` (an
  id, or `{ statement, owner }`), `tier`, `when` (`under`, `ending`, `containing`,
  `always` — the declarative form; relevance defaults to always, exactly as for every
  primitive today), `advisory`, `hint`, `exclusive`, `timeoutSec`, `capabilities`,
  `corpus = { atLeast, why }`, `ratchet`.
- **`use`** (data only): a core factory by its exported name (`forbidPattern`,
  `commandCheck`), or a package's as `package#export` (`@specwarden/security#secretScan`).
  The same `{ use = "…", …options }` table is how a data config names anything a JS config
  would build with a factory: `specSource`, a plugin.
- **Script keys**: `files` (the corpus pathspec or pathspecs), `except`, `corpora` (named
  extra corpora), `output` (`result` or `lines`), `cwd`, `env`, `shardable`.
- **A RegExp option takes a string** — its source, best written as a TOML literal string
  `'\bpanic\('` — or `{ regex = '…', flags = 'i' }`. The dialect is JavaScript's, whatever
  language the author knows; a construct from another dialect is refused by name (below).

```toml
#:schema ../../.types/check.schema.json
use = "forbidPattern"
rule = "no-panic"
files = "**/*.go"
except = ["**/*_test.go"]
pattern = '\bpanic\('
corpus = { atLeast = 1, why = "no Go source matched" }
```

```toml
use = "commandCheck"
rule = "vet-clean"
cmd = "go vet ./..."
output = "lines"
paths = ["go.mod"]
```

### The script header

A script declares itself in a comment block — the syntax of Python's PEP 723, whose
content is TOML — with the language's own line-comment prefix:

```python
# /// specwarden
# rule = "no-breakpoint"
# files = "**/*.py"
# corpus = { atLeast = 1, why = "no Python source matched" }
# ///
from specwarden import Finding, check


@check
def no_breakpoint(ctx):
    for path in ctx.corpus:
        for number, line in ctx.lines(path):
            if "breakpoint()" in line:
                yield Finding(path, number, "breakpoint() left in shipped code")
```

```go
//go:build ignore

// /// specwarden
// rule = "no-panic"
// files = "**/*.go"
// ///
package main

import (
	"strings"

	sw "github.com/specwarden/specwarden/sdks/go"
)

func Check(ctx *sw.Context) ([]sw.Finding, error) {
	var out []sw.Finding
	for _, path := range ctx.Corpus {
		lines, err := ctx.Lines(path)
		if err != nil {
			return nil, err
		}
		for i, line := range lines {
			if strings.Contains(line, "panic(") {
				out = append(out, sw.Finding{File: path, Line: i + 1, Message: "panic() in shipped code"})
			}
		}
	}
	return out, nil
}

func main() { sw.Run(Check) }
```

```sh
# /// specwarden
# rule = "no-todo"
# files = "src/**/*.sh"
# ///
xargs -0 sh -c 'p=$1; shift; grep -Hn -e "$p" -- "$@"; [ "$?" -le 1 ]' grep 'TODO' < "$SPECWARDEN_CORPUS"
```

The header is read **without running the script** — by the engine's TOML reader, against the
same schema — so `--list`, `doctor`, relevance and `specwarden types` never start a Python,
a Go build or a bash.

### The script protocol, version 1

The engine does everything a check shares with every other check; the script does only its
logic.

1. **Before spawning**: the engine resolves the runtime (probed, below), computes `files`
   and each named corpus through its own pathspec semantics — NUL-safe, tracked, cached
   (plan 02) — applies `except`, judges the **corpus floor** (below it, the script never
   starts), and slices the corpus by `shard` when the check is `shardable`.
2. **It writes a context file** into a per-run temporary directory:

```json
{
  "protocol": 1,
  "check": { "id": "no-panic", "rule": "no-panic", "tier": "fast", "capabilities": ["read"] },
  "mode": "check",
  "changed": ["cmd/app/main.go"],
  "fullRun": null,
  "corpus": ["cmd/app/main.go", "cmd/app/паника.go"],
  "corpora": {},
  "shard": null,
  "threshold": null
}
```

3. **It spawns the script** at the repository root (or its declared `cwd`, inside it),
   asynchronously, under plan 02's deadline and tree kill, with:
   - `SPECWARDEN_PROTOCOL=1`, `SPECWARDEN_CONTEXT`, `SPECWARDEN_RESULT`, `SPECWARDEN_MODE`,
     `SPECWARDEN_CORPUS` and `SPECWARDEN_CHANGED` (NUL-separated lists),
     `SPECWARDEN_CORPUS_<NAME>` per named corpus — absolute native paths;
   - stdin: the corpus, NUL-separated, then closed;
   - the runtime's own environment (below).
4. **It reads the answer** by the check's `output`:
   - **`result`** (the default for `.py` and `.go`, which the SDKs write): the JSON file at
     `SPECWARDEN_RESULT` — `protocol`, `findings` (`file`, `line`, `column`, `severity`,
     `message`), `examined` and `unit`, `notes`, and `error` for a check that raised.
     stdout and stderr stay free for the author's own prints.
   - **`lines`** (the default for `.sh`): stdout, one finding per line, in the grammar every
     compiler and linter already prints — `path[:line[:column]]:[ ][severity:] message`,
     `severity` one of `error`, `warning`, `info`, `note`; `grep -n`'s `path:line:text` is
     one of its shapes.
5. **The verdict is the engine's**, assembled by the same builder as `defineCheck`: findings
   stamped with the rule, the floor judged again on `examined` (the corpus size when the
   script does not say), ratchets counted, `--tighten` and `--fix` as for any check.

**Exit codes are strict**: a script check that exits non-zero has failed — whatever it
printed or wrote — and the failure shows the tail of its stderr. A wrapped tool whose exit
codes mean something else declares them: `exits = { ok = [0, 1] }`.

**Fix mode**: with `SPECWARDEN_MODE=fix`, a check that declared `write` repairs what it
can; the engine then drops its whole read and listing snapshot — it cannot know what the
script touched — and runs the check again, as it does for any fix.

**Replay**: `check --id <id> --keep-context` keeps the context and result files and prints
the one command line that reruns the script by hand with them.

### Runtimes

A runtime is a probe and a command line. It is probed **once per run** — shared by every
lane under `--jobs` — by running it, never by finding it on `PATH`, and `doctor` prints each
runtime's path, version and SDK version, or why it is not usable.

- **Python** — resolved from the first of these that works: `runtimes.python.command` in
  the config, `SPECWARDEN_PYTHON`, the repository's `.venv`, `python3`, `py -3` on Windows,
  `python`. Runs `python -m specwarden.run <file>` for `result` and `python <file>` for
  `lines`; `uv run --script` instead when the file carries a PEP 723 `/// script` block and
  `uv` is present. Adds `PYTHONUTF8=1`, `PYTHONIOENCODING=utf-8`,
  `PYTHONDONTWRITEBYTECODE=1`.
- **Go** — `runtimes.go.command`, else `go`. Builds the check once into
  `.specwarden/.cache/go/`, keyed by a hash of the file, `go.mod`, `go.sum`, the Go version
  and the target, then runs the binary. Adds `GOWORK=off`.
- **bash** — `runtimes.bash.command`, else the engine's platform shell (Git Bash on Windows).
  Runs `bash <file>`. Adds nothing.

Each may be pinned: `runtimes.python.version = ">=3.11"` fails a check on a machine with an
older one, naming both. Go's own pin is `.specwarden/go.mod`'s `go` line.

### The SDKs

Two thin libraries with no dependencies, speaking protocol 1, idiomatic in their language
(snake_case in Python, exported names in Go) while the data schema stays one vocabulary:

| Concern          | Python — `specwarden` on PyPI, Python 3.10+                                                          | Go — `github.com/specwarden/specwarden/sdks/go`                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| declare the body | `@check` on a function returning or yielding `Finding`s                                              | `sw.Run(Check)` with `func Check(*sw.Context) ([]sw.Finding, error)`             |
| a repair         | `@fix`                                                                                               | `sw.Fix(fn)`                                                                     |
| the context      | `ctx.corpus`, `ctx.corpora`, `ctx.changed`, `ctx.full_run`, `ctx.shard`, `ctx.threshold`, `ctx.mode` | the same, as fields                                                              |
| helpers          | `ctx.read`, `ctx.lines`, `ctx.exists`, `ctx.run`, `ctx.write`                                        | `ctx.Read`, `ctx.Lines`, `ctx.Exists`, `ctx.Run`, `ctx.Write`                    |
| capabilities     | a helper whose capability was not declared raises, naming it                                         | returns an error naming it                                                       |
| an exception     | written as the result's `error`, with the traceback; exit 1                                          | a panic recovered the same way                                                   |
| tests            | `specwarden.testing.run(check, files={…})`, and a pytest plugin collecting `*.check.test.py`         | `swtest.Run(t, Check, swtest.Tree{…})`, run by `go test <check> <check>_test.go` |
| typing           | fully annotated, `py.typed`                                                                          | Go's own                                                                         |

Both refuse a context whose `protocol` they do not speak, naming both versions.

### Tests, in one format for every form

A check of any form can carry a `<id>.check.test.toml` beside it — cases, each a tree and
what the check must say about it:

```toml
[[case]]
name = "a panic is found"
files = { "cmd/a.go" = "package a\nfunc f() { panic(1) }\n" }
findings = ["cmd/a.go:2"]

[[case]]
name = "clean code passes"
files = { "cmd/a.go" = "package a\n" }
findings = []

[[case]]
name = "a corpus with no Go file is refused"
files = { "README.md" = "# x\n" }
fails = "corpus"
```

`specwarden test` runs them — an in-process check against the engine's in-memory tree, a
script or a tool in a temporary real repository (plan 02's helper) — and `new` writes one
with a failing case, so every check, in every language, has been seen red.

---

## What each way cannot do, and why

| Capability                                                 | TS / JS         | Data              | Python            | Go               | Shell        | Wrapped tool        |
| ---------------------------------------------------------- | --------------- | ----------------- | ----------------- | ---------------- | ------------ | ------------------- |
| custom logic                                               | ✓               | ✗ ¹               | ✓                 | ✓                | ✓            | the tool's own      |
| the primitives and the modules' factories                  | ✓               | ✓                 | ✗ ²               | ✗ ²              | ✗ ²          | ✗ ²                 |
| a function as an option ³                                  | ✓               | ✗                 | ✗                 | ✗                | ✗            | ✗                   |
| declarative `when`, `tier`, `rule`, `hint`, `timeoutSec` … | ✓               | ✓                 | ✓                 | ✓                | ✓            | ✓                   |
| listed and filtered without running its body               | ✓ ⁴             | ✓                 | ✓                 | ✓                | ✓            | ✓                   |
| corpus floor                                               | ✓               | ✓                 | ✓                 | ✓                | with `files` | `files` or `expect` |
| a finding per file and line                                | ✓               | ✓                 | ✓                 | ✓                | ✓            | `lines`/`result` ⁵  |
| ratchet and `--tighten`                                    | ✓               | ✓                 | ✓                 | ✓                | ✓            | `lines`/`result` ⁵  |
| `--fix`                                                    | ✓               | fixable factories | ✓                 | ✓                | ✓            | a `fix` command     |
| capabilities enforced                                      | on ports        | on ports          | on SDK helpers ⁶  | on SDK helpers ⁶ | ✗ ⁶          | ✗ ⁶                 |
| refused by a denied `exec`                                 | if declared     | if declared       | always ⁷          | always ⁷         | always ⁷     | always ⁷            |
| NUL-safe names, untracked note, listing cache              | ✓               | ✓                 | its corpus ⁸      | its corpus ⁸     | its corpus ⁸ | ✗ ⁸                 |
| read cache, reads counted by `--cost`                      | ✓               | ✓                 | ✗ ⁹               | ✗ ⁹              | ✗ ⁹          | ✗ ⁹                 |
| ended mid-work at its deadline                             | ✗ ¹⁰            | ✗ ¹⁰              | ✓                 | ✓                | ✓            | ✓                   |
| truly parallel under `--jobs`                              | its commands ¹¹ | ✗ ¹¹              | ✓                 | ✓                | ✓            | ✓                   |
| sharding                                                   | by hand         | its factory's     | automatic ¹²      | automatic ¹²     | automatic ¹² | `shardable`         |
| editor completion                                          | types (plan 03) | schema ¹³         | SDK only ¹⁴       | SDK only ¹⁴      | ✗ ¹⁴         | schema ¹³           |
| the repository's rule ids, tiers, check ids checked        | in the editor   | in the editor ¹³  | at load ¹⁴        | at load ¹⁴       | at load ¹⁴   | in the editor ¹³    |
| a test beside it                                           | node:test, TOML | TOML              | SDK, pytest, TOML | `go test`, TOML  | TOML         | TOML                |
| runs with no Node installed                                | binary          | binary            | binary            | binary           | binary       | binary              |
| runs with no `package.json`                                | plan 01 phase 1 | ✓ ¹⁵              | ✓                 | ✓                | ✓            | ✓                   |
| needs on every machine that runs it                        | —               | —                 | Python 3.10+, SDK | Go               | bash         | the tool            |
| cost to start, on Windows                                  | none            | none              | unmeasured ¹⁶     | 40–75 ms ¹⁸      | 50–60 ms ¹⁸  | the tool's          |
| the same verdict on every machine                          | ✓               | ✓                 | environment's ¹⁷  | Go version's ¹⁷  | tools' ¹⁷    | tool version's ¹⁷   |

1. Data declares; it does not compute. Logic belongs in a script, or in code.
2. A factory is an in-process object. A script that needs a primitive's rule declares that
   rule as a data file beside itself — two checks, each doing one thing.
3. A function cannot cross into a file format or a process boundary. The option is refused
   by name, pointing at the forms that can take it; `scriptCheck` from a `.ts` config is how
   a script gets one.
4. A code check is imported to be listed, which runs its module's top level — never its
   body.
5. In `exit` mode a tool says only pass or fail: there is nothing to count, attribute to a
   file, or ratchet.
6. The engine gates what it hands out. In every language — JavaScript included — the
   standard library is not gated: a check can open a file it did not declare. The SDKs gate
   their helpers exactly as the engine gates its ports; a shell script has no helpers to
   gate. The guide says this in these words.
7. A script is a process the engine starts, so `denyCapabilities: ['exec']` refuses every
   script check, named, whatever it declared.
8. The corpus the engine passes is NUL-safe, cached and counted; a script that runs git
   itself is outside all three. The SDKs' listing helper runs git as the engine does
   (`-z`, glob pathspecs) and is held to the same pathspec cases (below).
9. A script reads files itself; `--cost` reports its process time and its corpus, not its
   reads.
10. A body running in the engine's process cannot be interrupted mid-computation; the
    deadline fails it and ends the commands it started (plan 02). A process can be ended.
11. Engine checks are synchronous and share one thread; processes overlap.
12. For a `shardable` script the engine slices the corpus it passes, so the script needs
    no sharding code.
13. `specwarden types` writes `.specwarden/.types/check.schema.json` — the published schema
    plus this repository's rule ids, tiers, check ids and installed factories as enums; a
    TOML file names it with `#:schema`, a JSON file with `$schema`.
14. A header is a comment, and no editor completes inside one; the engine validates it at
    load against the same schema and suggests the nearest valid key or id.
15. A data file imports nothing; only a `use` naming a package needs that package installed,
    or supplied by the binary.
16. No working Python on the measuring machine; CI measures it, and the number goes in the
    phase's commit.
17. A script's verdict is only as reproducible as its environment — the interpreter and its
    packages, the Go version, the local `grep`, the wrapped tool's version. `doctor` prints
    each runtime's version, and `runtimes.<name>.version` pins it.
18. Go: the kept binary, per run; its first build costs 0.2–0.9 s. Shell: bash itself, plus
    about 20 ms for each command the script starts.

---

## Edge cases, and what each one does

### Discovery and loading

| Case                                                                           | What happens                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a `*.check.<ext>` no loader claims — `.rb`, `.ps1`, `.bash`, `.yaml`, `.jsonc` | a load error listing the supported forms and the nearest one: `.bash` → rename to `.sh`; `.yaml` → TOML; `.jsonc` → TOML, which has comments; anything else → wrap it as a tool in a `.check.toml` |
| two files, one id, in any two forms (`a.check.py`, `a.check.toml`)             | a load error naming both                                                                                                                                                                           |
| a test file with no check beside it                                            | a load error: a test of nothing                                                                                                                                                                    |
| a test file named like a check                                                 | never discovered as one: `*.check.test.*` and `*.check_test.go` are tests                                                                                                                          |
| `config.toml` beside `config.mjs` (or any two forms of one declaration)        | a load error naming both                                                                                                                                                                           |
| a data file that declares no check                                             | a load error                                                                                                                                                                                       |
| a UTF-8 byte-order mark (an editor on Windows)                                 | accepted                                                                                                                                                                                           |
| two equal keys in a `.check.json`                                              | a load error at the second — `JSON.parse` alone would keep the last                                                                                                                                |
| a TOML integer beyond 2⁵³                                                      | a load error: it cannot be held exactly                                                                                                                                                            |
| an unknown key                                                                 | a load error with the nearest valid key                                                                                                                                                            |
| an option only code can express                                                | a load error naming the option and the forms that take it                                                                                                                                          |
| `use` naming a package that is not installed                                   | a load error with the install command — or, under the binary, supplied                                                                                                                             |
| `use` naming an export that publishes no spec                                  | a load error: not declarable                                                                                                                                                                       |
| a regex in another dialect — `(?P<n>…)`, `\A`, `\z`, a leading `(?i)`          | a load error naming the construct and its JavaScript spelling                                                                                                                                      |

### The header

| Case                                              | What happens                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| no `/// specwarden` block                         | a load error showing the block to add                            |
| two blocks, or one never closed                   | a load error at the line                                         |
| the block after the first line of code            | a load error: it belongs in the leading comments                 |
| a line in the block with the wrong comment prefix | a load error at the line                                         |
| a PEP 723 `/// script` block beside it            | allowed; it is how `uv` installs the check's own dependencies    |
| `output = "lines"` with no `files`                | a load error: its silence could not be told from reading nothing |

### Runtimes

| Case                                                                | What happens                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| a runtime on `PATH` that does not run (measured: every Python here) | the probe fails; each check needing it fails, naming what was tried and what it printed                                 |
| no runtime at all                                                   | the check fails with the install hint — never skipped. Its tier is how a team keeps it off machines without the runtime |
| below a pinned version                                              | the check fails, naming both versions                                                                                   |
| Python without the SDK in that interpreter                          | the check fails with `pip install specwarden` for that interpreter's path, and the `uv` alternative                     |
| a broken `.venv`                                                    | the probe fails naming it; there is no silent fallback to another Python and its other packages                         |
| Python writing `__pycache__` into `.specwarden/`                    | prevented by `PYTHONDONTWRITEBYTECODE`                                                                                  |
| Python on Windows in a legacy code page                             | `PYTHONUTF8` makes every read and print UTF-8                                                                           |
| an SDK that does not speak the context's protocol                   | the check fails, naming both versions and the upgrade                                                                   |
| a Go corpus in argv                                                 | never: `go run` would compile any `.go` argument (measured); the corpus goes by stdin and file                          |
| a `go.work` above `.specwarden/`                                    | ignored, by `GOWORK=off`                                                                                                |
| Go offline with modules not yet downloaded                          | the build fails naming `go mod download`; the guide has CI cache the module directory and commit `go.sum`               |
| two Go checks built at once under `--jobs`                          | Go's cache is safe to share; each binary is written to a temporary name and renamed                                     |
| the first run of a new binary on Windows (measured 0.4 s)           | paid once per build, since the binary is kept                                                                           |
| a Go check importing the consumer's `internal/` packages            | impossible by Go's own rule; public packages can be imported through a `replace` in `.specwarden/go.mod`                |
| no bash on Windows                                                  | the check fails, naming Git for Windows                                                                                 |
| a `.check.sh` with CRLF endings (measured: silently wrong)          | a load error; `init` writes `.specwarden/.gitattributes` with `*.sh text eol=lf`                                        |
| macOS's bash 3.2                                                    | everything the engine writes (`new`, templates) runs on it; a user's own script is theirs                               |
| an executable bit, a shebang                                        | irrelevant: the engine always names the interpreter                                                                     |

### Input, output and the verdict

| Case                                                                         | What happens                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| a script that prints its own debugging in `result` mode                      | harmless: the result is a file                                                              |
| no result file, or one that does not parse                                   | the check fails, naming the first error                                                     |
| a non-zero exit with findings or a result                                    | the check fails; the stderr tail is shown                                                   |
| a line in `lines` mode that does not parse                                   | the check fails, naming the line; a wrapped tool lists its non-finding lines in `ignore`    |
| colour codes and carriage returns in output                                  | stripped before parsing                                                                     |
| output that is not UTF-8                                                     | decoded with replacement; a path containing a replacement character fails the check         |
| a finding with an absolute path inside the repository, `./x`, or backslashes | made repository-relative with forward slashes; a Windows drive letter is read as part of it |
| a finding naming a file outside the repository, or one that does not exist   | the check fails — nothing printed names a file the consumer does not have                   |
| a path containing `:<digits>:`                                               | ambiguous in `lines` mode, and documented; `result` mode has no ambiguity                   |
| thousands of findings                                                        | shown up to a limit, counted in full, so a ratchet stays exact                              |
| a script that never reads stdin                                              | the engine writes stdin without blocking and ignores the broken pipe                        |
| a script that starts background processes                                    | ended with the tree at the deadline (plan 02)                                               |
| a crash of the engine mid-run                                                | its temporary directory is removed by the exit handler (plan 02)                            |
| `examined` below the floor                                                   | the check fails, as any empty corpus does                                                   |
| a corpus below the floor before the run                                      | the script is never started                                                                 |
| `--fix` on a check that did not declare `write`                              | refused, naming the capability                                                              |

---

## Invariants every phase keeps

- **A check means the same thing however it is written.** Id from the file name, the rule
  stamp, the floor, the ratchet, the verdict — built once, by the factories, for every form.
- **Nothing runs to be listed.** A data file and a header are read; a code check is
  imported; no script, build or interpreter starts for `--list`, `doctor`, relevance or
  types.
- **No silent skip, in any form.** A missing runtime, an unreadable output, an unclaimed
  extension: each is a named failure with its remedy.
- **The engine is the only interpreter of pathspecs.** Every corpus a script receives was
  resolved by it; an SDK helper that lists is held to the same cases.
- **Core still depends on nothing.** The TOML reader is core's own; the SDKs are separate
  packages with no dependencies of their own.
- **Documentation changes with the behaviour**, in the same phase.

---

## Phase 1 — every factory publishes its spec

- `TOptionSpec` gains nested shapes — an object's fields, an array's element — on top of
  plan 03's element kinds and literal sets, so a spec describes an option completely.
- Every primitive, `commandCheck`, and every module factory carries its spec (`.spec`),
  through plan 03's `defineFactory`; so do the config, the rules and the perimeter.
- **One converter** turns data into options by the spec: a string where a RegExp goes, a
  `{ use }` table where a factory's product goes, and a refusal for a function-only option.
- **JSON Schemas** for a check, a config, a rules file, a perimeter and a script result are
  generated from the specs into `core/schemas/`, published in the package, and compared by
  a drift check so they cannot fall behind a factory.

Nothing reads a new file format yet; this is the vocabulary every later phase speaks.

Before: `contract-architect` — every factory's spec becomes public.

```bash
pnpm --filter specwarden exec vitest run --typecheck src/primitives
node scripts/schemas.mjs --check
pnpm gate
```

## Phase 2 — checks as data: JSON

- Discovery becomes a table of loaders by extension (plan 03's), and gains `.check.json`;
  the unclaimed-extension refusal lists every supported form.
- `config.json`, `rules.json`, `perimeter.json` join the declaration forms.
- **Declarable**: `forbidImport`, `forbidPattern`, `pathContract`, `siblingRequired`,
  `mustDeclare`, `referencesResolve` (its default resolver), `regenerable`, `commandCheck`,
  and every module factory whose options are all data — `secretScan`, the docs checks, the
  presets that return several checks. `sourcesAgree` becomes declarable through a built-in
  extractor: a file and a capture-group pattern per side. **Not declarable**, and refused by
  name: `defineCheck`, `fromResult`, a function-valued `when`, a custom `resolve`.
- Several checks in one file: a top-level `checks` array, each entry with its `id` — as a
  code file may export `checks`.
- The loading edge cases of the first table: a BOM, duplicate keys, integers, unknown keys,
  function-only options, `use` failures, foreign regex dialects.
- **Parity**: every declarable factory, declared once in JSON and once in `.ts`, produces an
  equal check and an equal verdict on the same tree.

Watched red first: a `.check.json` in a core playground — refused as unclaimed today.

Before: `contract-architect`; `adversarial-reviewer` after it — a file format is a promise
to every repository that writes one.

```bash
pnpm --filter specwarden exec vitest run src/runtime/consumer-tree src/primitives
pnpm --filter specwarden exec vitest run _playground
pnpm gate
```

## Phase 3 — checks as data: TOML

- A TOML 1.0 reader in core, with no dependency, held to the `toml-test` corpus — its valid
  and its invalid cases both — and reporting line and column.
- `.check.toml`, `config.toml`, `rules.toml`, `perimeter.toml`, through the same converter
  and schemas as JSON. A `#:schema` comment is a comment to the engine and a schema to the
  editor.
- A date or time where the spec has none is refused; TOML's other types map onto the spec's
  kinds one to one.

Before: `test-writer` for the conformance suite.

```bash
pnpm --filter specwarden exec vitest run src/runtime/consumer-tree/toml
pnpm gate
```

## Phase 4 — a test for any check, in TOML

- `<id>.check.test.toml`, as designed above: cases of a tree and the findings, or the
  failure, the check must produce.
- `specwarden test` runs them for in-process checks against the in-memory tree, beside the
  code tests it already runs. Script and tool checks join in phase 6, with a temporary real
  repository; one case format serves both.
- A test with no check, a case whose tree escapes the root, a finding location that names
  no file of the case: each a load error.

```bash
pnpm --filter specwarden exec vitest run src/runtime/cli src/testing
pnpm gate
```

## Phase 5 — a wrapped tool reports findings, not just an exit

- `commandCheck` gains `output`: `exit` (today's behaviour, the default), `lines` or
  `result`; `exits` for a tool whose exit codes mean something else; `ignore` for the
  non-finding lines a tool prints; `fix`, the command that repairs.
- The `lines` grammar and the `result` schema of the protocol, their normalisation and
  limits, from the edge-case tables — built here, where a code config can use them too, and
  reused by scripts in phase 6.
- A wrapped tool in `lines` or `result` mode gets findings per file and line, a ratchet and
  `--tighten`, which in `exit` mode it cannot have.

Watched red first: `go vet` on a tree with two defects — today one failure, after this
phase two findings.

Before: `contract-architect` — new options on a published factory, and a published result
schema.

```bash
pnpm --filter specwarden exec vitest run src/runtime/runner/command-check
pnpm gate
```

## Phase 6 — script checks, and bash

- **`scriptCheck`**, exported: a script's path and its declaration in, a check out — the
  protocol's engine half, from the corpus to the verdict.
- **The header reader**: the `/// specwarden` block, its prefixes, the edge cases of its
  table, validated against the schema with suggestions.
- **The runtime framework**: a probe per runtime per run, shared across lanes; pins;
  `doctor`'s runtime table.
- **bash** as the first runtime, needing no SDK: `.check.sh`, `lines` by default, the CRLF
  refusal, `.specwarden/.gitattributes` and `.specwarden/.gitignore` (the `.cache/`) from
  `init`.
- A script check needs `exec` implicitly; fix mode needs `write`; `--keep-context` and the
  replay line.
- The TOML test cases of phase 4 run script and tool checks in a temporary repository.

Watched red first: a `.check.sh` in a core playground — refused as unclaimed today; then a
CRLF copy of it, refused at load.

Before: `contract-architect` — a new factory, a new file form, a wire protocol;
`adversarial-reviewer` after it, on the protocol, which is the hardest promise in this plan
to take back.

```bash
pnpm --filter specwarden exec vitest run src/runtime/scripts src/runtime/consumer-tree
pnpm --filter specwarden exec vitest run _playground
pnpm gate
```

## Phase 7 — Python

- **The runtime**: the resolution order and probe of the runtime table, the environment it
  adds, `uv run --script` for a PEP 723 block.
- **The SDK** in `sdks/python/`: the API of the SDK table, `python -m specwarden.run`, the
  capability-gated helpers, `@fix`, errors into the result, protocol negotiation,
  `specwarden.testing` and its pytest plugin, full annotations.
- **A new registry kind, `sdk`**: its README, licence and `pyproject.toml` fields generated
  from `scripts/registry.mjs`; its version kept by changesets in a private manifest the
  generator propagates, so one version source still rules; a coverage ratchet measured by
  its own tool; a playground — a Python repository whose `.check.py` files run through the
  CLI.
- **CI** runs the SDK's suite and its playground on Linux, macOS and Windows, on every
  CPython the SDK supports.

Before: `canon-keeper` on where an SDK sits in `skills/structure/SKILL.md` §5, then
`contract-architect` — a new package, a new registry, a new language's API.

```bash
python -m pytest sdks/python
pnpm gate --id package-playgrounds --id scaffold-drift
pnpm gate
```

## Phase 8 — Go

- **The runtime**: the probe, the build into `.specwarden/.cache/go/` keyed as the runtime
  table says, `GOWORK=off`, atomic writes, the cache pruned of binaries no check still
  names, `.exe` on Windows.
- **`init --format go` and `new --format go`** write `.specwarden/go.mod`, requiring the SDK;
  `go.sum` is committed.
- **The SDK** in `sdks/go/`, module `github.com/specwarden/specwarden/sdks/go`, released by
  `sdks/go/v…` tags — a module in this repository, not a second one: the API of the SDK
  table, `swtest`, and a check's test run as `go test <check> <check>_test.go`.
- The same registry kind, ratchet, playground and three-platform CI as Python.

Before: `contract-architect`.

```bash
bash -c 'cd sdks/go && go test ./...'
pnpm gate --id package-playgrounds --id scaffold-drift
pnpm gate
```

## Phase 9 — writing one starts where the team already is

- **`new <id> --format toml|json|py|go|sh`**, with `--use <factory>` for data, writes the
  check and its TOML test with one failing case; `init --format toml|json` writes the
  config and rules as data. Without `--format`, plan 03's rule extends: the form most
  existing checks use; with none, `toml` in a repository plan 01 detects as Go, Python or
  C++, `ts` where TypeScript is present, else `mjs`.
- **`specwarden types`** also writes `.types/check.schema.json` with the repository's rule
  ids, tiers, check ids and installed factories as enums; every data file `new` writes
  names it; `types-current` holds it with the rest.
- **A part gains a structured form** — its factory and options — rendered to code or to data,
  so one part serves every format and no template carries two copies of a check.
- **Plan 01's `go`, `python` and `cpp` templates write TOML by default**; their playgrounds
  are regenerated and proved red again. The other templates keep their format.

Before: `template-author` for the templates; `contract-architect` for the flags.

```bash
node scripts/playgrounds.mjs --write go
node scripts/playgrounds.mjs --write python
node scripts/playgrounds.mjs --write cpp
pnpm gate --id playgrounds --id package-playgrounds --id scaffold-drift
pnpm gate
```

## Phase 10 — taught in the team's own language

- **`core/GUIDE.md`**: the four forms and when to choose each — data first, a script when the
  rule needs logic, a wrapped tool when a tool already knows the rule; the capability table
  above, with its reasons; the protocol; the runtimes; the edge cases a user can meet.
- **`sdks/python/GUIDE.md` and `sdks/go/GUIDE.md`**, written for someone who has never read a
  line of JavaScript: every example in their language and in TOML only.
- **The shipped skill** teaches a consumer's agent the same choice, so an agent asked for a
  rule in a Go repository writes TOML or Go, not TypeScript.
- **`core/GLOSSARY.md`** defines each new term once; the `vocabulary` check learns any
  retired spelling met while writing them.

```bash
pnpm gate --id skills --id docs --id vocabulary
pnpm gate
```

---

## How it is proved

- **Unit specs** beside every unit: the converter, the TOML reader, the header reader, the
  loaders, `scriptCheck`, the lines parser, the result reader, each runtime.
- **Conformance**: `toml-test` for the reader; the result JSON Schema against the SDKs'
  output.
- **Parity**: every declarable factory in data and in code, equal checks and verdicts.
- **One set of pathspec cases**, the VCS contract suite's, exported as data and run against
  the engine and against each SDK's listing helper.
- **One protocol suite**: the same scripted scenarios — clean, findings, an exception, a
  crash, a timeout, a fix — written once per language and required to yield identical
  verdicts.
- **Playgrounds**: one per SDK, through the CLI; the root playground's consumer gains a data
  check, a Python check, a Go check and a shell check beside its code checks.
- **Three platforms** for everything that starts a process.
- **Seen red** before believed: each phase names its first red, and every scaffolded check
  ships with a failing case.

## The release

One version. `specwarden` minor: new forms, a new factory, new options — nothing removed,
no verdict changed for a tree that had none of the new files. The modules minor: each
factory gains its spec. The templates and `scaffold-parts` minor: TOML output. **Two new
packages**: `specwarden` on PyPI and the Go module, each at its first version.
`release-manager` reads the changesets against the diff; `adversarial-reviewer` reads the
whole before it is cut.

**Prerequisites that are the user's**, not this plan's: owning `specwarden` on PyPI (shared
with plan 01's binary wheels — the SDK is a pure wheel of the same distribution and never
depends on the binary), and `github.com/specwarden/specwarden` public, which the Go module
path requires.

---

## Decisions

### Decision: every form compiles to a published factory

- Rejected: a separate engine path per language — each would re-implement the floor, the
  rule stamp and the verdict, and they would drift the way the VCS fake once drifted from
  git.

### Decision: data keys are the factories' option names

- Rejected: snake_case keys for TOML's convention — two spellings of every option, and a
  translation table in every document.

### Decision: a script declares itself in a header, read without running it

- Rejected: a `--describe` call cached by file hash, proposed earlier in this work — every
  `--list`, `doctor` and relevance decision would start an interpreter or a Go build, the
  cache would key on the file, the SDK, the interpreter and the environment, and a machine
  without Python could not even list the roster. A shell script could not answer at all.
- Rejected: metadata in the SDK decorator — the same execution problem, and shell has no
  decorator.
- Rejected: a sidecar `.check.toml` per script — two files for one check, which drift apart.

### Decision: the header is PEP 723's block syntax holding TOML

- Rejected: YAML front matter — a YAML parser in core was already refused, and the syntax
  would be new to everyone.
- Rejected: an invented `# spw: key=value` syntax — a grammar nobody knows, where TOML is
  one they already write, and PEP 723's is one Python tooling already reads.

### Decision: JSON and TOML; not YAML, not JSONC

- Rejected: YAML in core — the full grammar is a dependency-sized parser, and a subset
  parser accepts files it misreads, which is the silent wrong this product exists against.
- Rejected: JSONC — a second commented format where TOML already is one.

### Decision: the engine computes the corpus and passes it

- Rejected: each script listing its own files — every SDK would carry its own reading of
  pathspecs, the quoting bug of plan 02 would return per language, and the floor could not
  be judged before the script started.

### Decision: context and result travel as files named in the environment

- Rejected: a JSON result on stdout, plan 01's first sketch — one debugging `print` corrupts
  it.
- Rejected: a request-and-response protocol over stdio — a stateful channel to implement in
  every language, for helpers the corpus already makes unnecessary.

### Decision: the lines grammar is the one compilers print

- Rejected: a grammar of our own — `go vet`, `mypy`, `clang` and `grep -n` already print
  `path:line[:column]: message`, so a shell check and a wrapped tool need no formatting at
  all.

### Decision: a non-zero exit fails a script, unless the check says otherwise

- Rejected: reading exit 1 as "found nothing" by default, as grep does — a crashed script
  that exits 1 would then pass. A tool with other conventions declares them in `exits`.

### Decision: the engine builds a Go check once and keeps the binary

- Rejected: `go run` on every run — measured at 0.3–0.7 s each time even with a warm cache,
  against 40–75 ms for the kept binary.

### Decision: a Go check is one file, `//go:build ignore`, in a nested module

- Rejected: a directory per check — a package of one file each, and a layout nothing else in
  `.specwarden/` has.
- Rejected: one program holding every Go check — adding a check would rebuild them all, and
  one check's compile error would fail every other.
- Rejected: requiring the SDK in the consumer's own `go.mod` — it would join their build's
  dependencies for a tool that is not their product.

### Decision: Python runs through `python -m specwarden.run`

- Rejected: an `if __name__ == "__main__"` line in every check — boilerplate nobody should
  have to remember, and a check file's name, with its hyphens and dots, is not importable.
- Rejected: running the check from an `atexit` hook — exceptions and exit codes there are
  unreliable, which is what a verdict cannot be.

### Decision: a runtime is probed by running it

- Rejected: trusting `PATH` — measured: every Python on it here fails.
- Rejected: falling back to another Python when the first fails — the check would run
  against a different set of packages than its author's.

### Decision: `uv` is used when the check asks for it

- Rejected: always requiring the SDK to be pre-installed — a PEP 723 block lets a Python
  check carry its dependencies, and `uv` is how Python itself now runs such a file.

### Decision: bash, and only bash, for shell

- Rejected: POSIX `sh` beside it — two shells, two behaviours for one file.
- Rejected: PowerShell now — a third runtime to prove on three platforms; a PowerShell
  command can still be wrapped as a tool.

### Decision: CRLF in a shell check is refused, not repaired

- Rejected: stripping carriage returns before running — the engine would run a file other
  than the one in the repository, and the fix belongs in `.gitattributes`, which `init`
  writes.

### Decision: data regexes are JavaScript's, with foreign syntax named

- Rejected: a regex dialect per author's language — one data file would mean different
  things on different engines; the refusal teaches the one spelling.

### Decision: the SDKs live in this repository, in the registry

- Rejected: separate repositories — a protocol change and its SDKs would land in different
  places and different releases, which is how a wire format drifts.

### Decision: the SDKs gate their helpers, and say that is all they gate

- Rejected: calling a script check sandboxed — nothing gates a language's standard library,
  in JavaScript either, and a claim of isolation would be the one false thing in the guide.

### Decision: the repository schema is a local file

- Rejected: a `$schema` URL on a CDN — offline editors lose it, its version can differ from
  the installed engine's, and it cannot know this repository's rule ids.

### Decision: one test format for every form

- Rejected: per-language tests only — a data check or a shell check would have no way to be
  seen red, which every check here must be.

### Decision: no embedded language

- Rejected: Starlark, Lua, Python in WebAssembly, Rego or WebAssembly modules — each asks the
  author to learn, or to build for, something they do not use; their own language, run as a
  process, asks nothing.

## Risks this plan carries

- **A script's verdict is its environment's.** Two machines with different Pythons, Go
  versions or `grep`s can disagree. `doctor` shows the versions, `runtimes.<name>.version`
  pins them, and the guide says it plainly.
- **Start-up adds up on Windows**: tens of milliseconds per script check. `when`, tiers and
  `--jobs` keep a pre-commit short; the guide shows the numbers.
- **Toolchains in this repository's CI** — Python and Go on three platforms — make the heavy
  tier slower; they run only where a changed file reaches the protocol, the SDKs or the
  runtimes.
- **The protocol is a promise in three languages at once.** It is versioned from the first
  release, and the SDKs refuse what they do not speak rather than guess.

## Harvest

| Fact                                                                              | Goes to                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| every form compiles to a factory — the model, and why                             | `core/SKILL.md`; `core/GUIDE.md`                             |
| data keys are the option names                                                    | docblock of the converter; `core/GUIDE.md`                   |
| the header syntax, and why not `--describe`                                       | docblock of the header reader                                |
| YAML and JSONC refused, with the reasons                                          | docblock of discovery                                        |
| the protocol: context, result, lines grammar, exits, fix, replay                  | `core/GUIDE.md`; the result schema's description             |
| what each form cannot do, and why                                                 | `core/GUIDE.md`; `sdks/python/GUIDE.md`; `sdks/go/GUIDE.md`  |
| `go run` compiles `.go` arguments; `//go:build ignore` single files; `GOWORK=off` | docblock of the Go runtime; `sdks/go/GUIDE.md`               |
| a Python on `PATH` is not a working Python                                        | docblock of the runtime probe                                |
| bash runs CRLF silently wrong; the `xargs -0 sh -c` idiom and its exit codes      | docblock of the bash runtime; `core/GUIDE.md`                |
| capabilities gate helpers, never a standard library                               | `core/GUIDE.md` §3; both SDK guides                          |
| an SDK is a registry kind, versioned through changesets                           | `skills/structure/SKILL.md` §5; `skills/publishing/SKILL.md` |
| the start-up measurements                                                         | the phase commits that took them                             |
| each consumer-visible phase                                                       | its changeset                                                |
