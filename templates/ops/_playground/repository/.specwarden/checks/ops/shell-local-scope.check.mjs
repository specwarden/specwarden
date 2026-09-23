/**
 * `shell-local-scope` — `local` is only legal inside a function.
 *
 * At top level it is a runtime error, and under `set -e` that error ends the script —
 * often long after the line that introduced it, in a deploy, at the worst moment. The
 * script parses, shellcheck is happy, and the failure waits.
 *
 * The pathspecs below are yours: a vendored script is not this repository's to style.
 */
import { shellLocalScope } from '@specwarden/ops';

export const check = shellLocalScope({
  id: 'shell-local-scope',
  title: 'no `local` outside a function',
  tier: 'fast',
  pathspecs: ['scripts/**/*.sh', 'deploy/**/*.sh', '*.sh'],
  when: (changed) => changed.some((f) => f.endsWith('.sh')),
  hint: 'Move the declaration inside a function, or drop `local` and name the variable so it cannot collide.',
});
