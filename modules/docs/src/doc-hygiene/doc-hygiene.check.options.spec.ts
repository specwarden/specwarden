import { describe, expect, it } from 'vitest';

import { errorsOf, runCheck } from 'specwarden';
import { docHygiene } from './doc-hygiene.check';

describe('docHygiene — its options', () => {
  it('refuses a misspelled option, and the retired `renderedSources`, by name', () => {
    expect(() => docHygiene({ fatCellLimt: 10 } as never)).toThrow('`fatCellLimt` is not an option of docHygiene');
    expect(() => docHygiene({ renderedSources: ['a.md'] } as never)).toThrow(
      '`renderedSources` is not an option of docHygiene',
    );
  });

  it('with nothing said: id `doc-hygiene`, the fast tier, every tracked document', async () => {
    const check = docHygiene();

    expect(check).toMatchObject({ id: 'doc-hygiene', tier: 'fast' });
    expect(errorsOf(await runCheck(check, { tree: { 'README.md': '[x](./gone.md)' } }))).toEqual([
      'README.md:1 links to `./gone.md`, which does not exist. Point the link at where the file is now.',
    ]);
  });
});
