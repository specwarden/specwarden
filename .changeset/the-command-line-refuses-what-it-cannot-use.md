---
'specwarden': minor
---

The command line refuses what it cannot use, exit 2, by name: an unknown flag (`--tighen`, `-x`), a value flag with no value (`--id` at the end of the line ran every check; `--base --json` dropped the base), a `--jobs` that is not a positive integer, and an explicit `--base` that does not resolve (it was the fail-safe full run, exit 0). `SPECWARDEN_BASE` stays fail-safe. An unknown command is named above the usage.

`--help`, `-h` and `help` print the usage to stdout and exit 0; they printed to stderr and exited 2.

The full-run note goes to stderr for every machine reporter, so `--reporter json` prints one JSON document; `--json` still keeps stderr quiet. The terminal reporter leads every finding with its `file:line`.

`parseArgs` returns two new fields, `help` and `problems`.
