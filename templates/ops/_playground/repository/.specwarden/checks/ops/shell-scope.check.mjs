// `shell-scope` — `local` is only legal inside a function.
// At top level it is a runtime error, and under `set -e` it ends the script — in a deploy, long
// after the line that introduced it.
// `scripts` are the ones that are yours: a vendored script is not this repository's to style.
import { shellScope } from '@specwarden/ops';

export const check = shellScope({
  scripts: ['scripts/**/*.sh', 'deploy/**/*.sh', '*.sh'],
  rule: 'A shell script declares `local` only inside a function, so a mistake fails at the line that made it.',
  hint: 'Move the declaration inside a function, or drop `local` and name the variable so it cannot collide.',
});
