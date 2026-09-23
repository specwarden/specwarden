# checks/

One file per check, grouped by SUBJECT — a family is what a check is about, never
when it runs. The engine discovers every `*.check.mjs` beneath this folder; nothing
has to import or list it.

| Family | Check files | From |
| --- | --- | --- |
| `security/` | secret-scan | `@specwarden/security` |
| `docs/` | doc-paths, doc-symbols (example, off) | `@specwarden/docs` |
| `workspace/` | lint, unit | `specwarden` |

## Adding a check

Create `<family>/<id>.check.mjs` exporting `check`. The file name is its id, and
`rule` is the statement it enforces, owned by the file. A module's check carries a rule of
its own; one built with the engine's `commandCheck`, `fromResult` or `defineCheck` has
none, and with no rule the run is red on orphan-check.

```js
import { commandCheck } from 'specwarden';
export const check = commandCheck({ cmd: 'pnpm lint', tier: 'heavy', rule: 'Nothing merges while the linter is red.' });
```

For a native one, a module factory or `fromResult` over a function of your own — it
receives the check context, so read through `ctx.files` and `ctx.vcs`, never the disk.

**Show it RED before believing it.** Write the failing case first and watch the check
reject it. A check nobody has seen fail is a hope.
