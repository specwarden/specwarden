# checks/

One file per check, grouped by SUBJECT — a family is what a check is about, never
when it runs. The engine discovers every `*.check.mjs` beneath this folder; nothing
has to import or list it.

| Family | Holds |
| --- | --- |
| _the folders beside this README_ | from the `ops` template |

## Adding a check

Create `<family>/<id>.check.mjs` exporting `check`, with `id` equal to the file name.
For an external command:

```js
import { commandCheck } from 'specwarden';
export const check = commandCheck({ id: 'lint', title: 'ESLint', tier: 'heavy', cmd: 'pnpm lint', when: () => true });
```

For a native one, a module factory (`docPaths`, `secretScan`, …) or `fromResult` over a
function of your own — it receives the check context, so read through `ctx.files` and
`ctx.vcs`, never the disk.

**Show it RED before believing it.** Write the failing case first and watch the check
reject it. A check nobody has seen fail is a hope.

Then `specwarden check --list` shows it — the moment the file exists.
