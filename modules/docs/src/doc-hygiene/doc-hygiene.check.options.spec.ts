import { describe, expect, it } from 'vitest';

import { errorsOf, runCheck } from 'specwarden';
import { docHygiene } from './doc-hygiene.check';

describe('docHygiene — its options', () => {
  it('refuses a misspelled option by name', () => {
    expect(() => docHygiene({ id: 'doc-hygiene', title: 't', fatCellLimt: 10 } as never)).toThrow(
      '`fatCellLimt` is not an option of docHygiene',
    );
  });

  it('reads every tracked document, in the fast tier, when neither is said', async () => {
    const check = docHygiene({ id: 'doc-hygiene', title: 't' });

    expect(check.tier).toBe('fast');
    expect(errorsOf(await runCheck(check, { tree: { 'README.md': '[x](./gone.md)' } }))).toEqual([
      'README.md:1 links to `./gone.md`, which does not exist.',
    ]);
  });
});
