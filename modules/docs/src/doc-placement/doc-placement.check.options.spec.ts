import { describe, expect, it } from 'vitest';

import { errorsOf, runCheck } from 'specwarden';
import { docPlacement } from './doc-placement.check';

describe('docPlacement — its options', () => {
  it('refuses a contract that is not a list, and a missing one, by name', () => {
    expect(() => docPlacement({ allowed: /^docs\// } as never)).toThrow('`allowed` must be an array');
    expect(() => docPlacement({} as never)).toThrow('`allowed` is required');
  });

  it('with nothing said: id `doc-placement`, the fast tier, every tracked document', async () => {
    const check = docPlacement({ allowed: [/^docs\//] });

    expect(check).toMatchObject({ id: 'doc-placement', tier: 'fast' });
    expect(errorsOf(await runCheck(check, { tree: { 'NOTES.md': '# n' } }))[0]).toContain('NOTES.md sits where');
  });
});
