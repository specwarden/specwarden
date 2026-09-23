---
'specwarden': minor
---

Every check factory — `forbidImport`, `forbidPattern`, `pathContract`, `siblingRequired`, `mustDeclare`, `referencesResolve`, `regenerable`, `sourcesAgree`, `defineCheck`, `fromResult`, `commandCheck`, `zoneBoundary` — now checks its options when the check file loads: a required option missing, an option of the wrong kind, and an option the factory does not take are refused by name, and the run exits 2 naming the file. Before, a missing `pattern` crashed the run with a raw stack, a string where a RegExp belonged failed inside the body in the platform's words, and a misspelled option (`excpet`) was dropped in silence — the check ran as if it had never been given.

Also refused at load: a `when` that is a string (it was read as "always relevant"), a `mustDeclare` field whose `pattern` is not a RegExp, a `referencesResolve` `extract` with no capture group, a `sourcesAgree` side without `name` and `extract`, and a `commandCheck` `expect` or `refuse` entry that is not a RegExp.

If your run now stops with `… failed to load: <factory> '<id>': …`, the option it names was not doing what the file said. `checkOptions` and `CheckOptionsError` are exported for a factory of your own.
