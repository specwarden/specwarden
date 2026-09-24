import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { docSymbols } from './doc-symbols.check';

const ID = { id: 'doc-symbols' };

/**
 * `suffixes: []` was documented by the scaffolds as INERT. It was the widest setting there
 * is: the suffix group is an alternation, an alternation of nothing matches the empty
 * string, and every backticked PascalCase name became a symbol the code had to declare.
 */
describe('docSymbols — its options', () => {
  it('refuses an empty `suffixes`, naming the option', () => {
    expect(() => docSymbols({ ...ID, code: ['src/**/*.ts'], suffixes: [] })).toThrow(CheckOptionsError);
    expect(() => docSymbols({ ...ID, code: ['src/**/*.ts'], suffixes: [] })).toThrow(
      "docSymbols 'doc-symbols': `suffixes` is empty",
    );
  });

  it('refuses a suffix that is the empty string, which widens the match to every name', () => {
    expect(() => docSymbols({ ...ID, code: ['src/**/*.ts'], suffixes: ['Service', ''] })).toThrow(
      "docSymbols 'doc-symbols': `suffixes` holds an empty string, which matches every backticked PascalCase name, not none.",
    );
    expect(() => docSymbols({ code: ['src/**/*.ts'], suffixes: [''] })).toThrow('docSymbols: `suffixes` holds');
  });

  it('refuses an empty `code` — no corpus declares anything', () => {
    expect(() => docSymbols({ ...ID, code: [], suffixes: ['Service'] })).toThrow('`code` is empty');
  });

  it('refuses a missing required option, and the retired spellings, by name', () => {
    expect(() => docSymbols({ ...ID, code: ['src/**/*.ts'] } as never)).toThrow('`suffixes` is required');
    expect(() => docSymbols({ ...ID, code: 'src', suffixes: ['S'], excludeCode: ['dist'] } as never)).toThrow(
      '`excludeCode` is not an option of docSymbols',
    );
  });

  it('with nothing said: id `doc-symbols`, the fast tier, every tracked document', async () => {
    const check = docSymbols({ code: 'src/**/*.ts', suffixes: ['Service'] });
    const tree = { 'README.md': '`GhostService` is here.', 'src/a.ts': 'export class RealService {}' };

    expect(check).toMatchObject({ id: 'doc-symbols', tier: 'fast' });
    expect(errorsOf(await runCheck(check, { tree }))).toEqual([
      'README.md names `GhostService`, which nothing in the code corpus declares. Rename it to the symbol that replaced it, or name it in `external` if a framework owns it.',
    ]);
  });
});
