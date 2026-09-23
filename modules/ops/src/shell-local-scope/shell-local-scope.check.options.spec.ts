import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { shellLocalScope } from './shell-local-scope.check';

/**
 * `when` was REQUIRED on every factory in this package and passed through untouched. A
 * check wired without one — as the package's own skill wires it — was green under `--all`
 * and killed the pre-push run with "when is not a function" the moment relevance applied.
 */
describe('shellLocalScope — its options', () => {
  it('is always relevant when it declares no `when` — never a function that is not there', () => {
    const check = shellLocalScope({ id: 'shell-local-scope', title: 't', pathspecs: ['scripts/*.sh'] });

    expect(check.when(['src/index.ts'])).toBe(true);
    expect(check.tier).toBe('fast');
  });

  it('keeps a relevance predicate it is given', () => {
    const check = shellLocalScope({ id: 's', title: 't', when: (changed) => changed.some((f) => f.endsWith('.sh')) });

    expect(check.when(['a.sh'])).toBe(true);
    expect(check.when(['a.ts'])).toBe(false);
  });

  it('reads every tracked `.sh` when no pathspec is said', async () => {
    const check = shellLocalScope({ id: 'shell-local-scope', title: 't' });
    const tree = { 'deploy/run.sh': '#!/usr/bin/env bash\nlocal target\n', 'README.md': '# a' };

    expect(errorsOf(await runCheck(check, { tree }))).toEqual(['deploy/run.sh:2  local target']);
  });

  it('refuses a pathspec given as one string, and an option it does not have', () => {
    expect(() => shellLocalScope({ id: 's', title: 't', pathspecs: 'scripts/*.sh' } as never)).toThrow(
      '`pathspecs` must be an array',
    );
    expect(() => shellLocalScope({ id: 's', title: 't', paths: ['a'] } as never)).toThrow(CheckOptionsError);
  });
});
