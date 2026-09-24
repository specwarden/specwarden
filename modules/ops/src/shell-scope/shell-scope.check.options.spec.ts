import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { shellScope } from './shell-scope.check';

/**
 * `when` was REQUIRED on every factory in this package and passed through untouched. A
 * check wired without one — as the package's own skill wires it — was green under `--all`
 * and killed the pre-push run with "when is not a function" the moment relevance applied.
 */
describe('shellScope — its options', () => {
  it('is always relevant when it declares no `when` — never a function that is not there', () => {
    const check = shellScope({ scripts: ['scripts/*.sh'] });

    expect(check.when(['src/index.ts'])).toBe(true);
    expect(check.tier).toBe('fast');
  });

  it('keeps a relevance predicate it is given', () => {
    const check = shellScope({ id: 's', title: 't', when: (changed) => changed.some((f) => f.endsWith('.sh')) });

    expect(check.when(['a.sh'])).toBe(true);
    expect(check.when(['a.ts'])).toBe(false);
  });

  it('reads every tracked `.sh` when no pathspec is said', async () => {
    const check = shellScope();
    const tree = { 'deploy/run.sh': '#!/usr/bin/env bash\nlocal target\n', 'README.md': '# a' };

    expect(check.id).toBe('shell-scope');
    expect(errorsOf(await runCheck(check, { tree }))).toEqual([
      'deploy/run.sh:2 `local target` is outside every function — bash refuses it at run time. Move it inside a function, or drop `local`.',
    ]);
  });

  it('takes `scripts` as one pathspec or a list, and refuses the old `pathspecs` and an empty list by name', () => {
    expect(shellScope({ scripts: 'scripts/*.sh' }).id).toBe('shell-scope');
    expect(() => shellScope({ pathspecs: ['scripts/*.sh'] } as never)).toThrow(
      '`pathspecs` is not an option of shellScope',
    );
    expect(() => shellScope({ scripts: [] })).toThrow('`scripts` is empty');
    expect(() => shellScope({ id: 's', title: 't', paths: ['a'] } as never)).toThrow(CheckOptionsError);
  });
});
