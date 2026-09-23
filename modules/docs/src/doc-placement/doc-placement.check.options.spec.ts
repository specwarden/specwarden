import { describe, expect, it } from 'vitest';

import { errorsOf, runCheck } from 'specwarden';
import { docPlacement } from './doc-placement.check';

describe('docPlacement — its options', () => {
  it('refuses a contract that is not a list, and a missing one, by name', () => {
    expect(() => docPlacement({ id: 'doc-placement', title: 't', allowed: /^docs\// } as never)).toThrow(
      '`allowed` must be an array',
    );
    expect(() => docPlacement({ id: 'doc-placement', title: 't' } as never)).toThrow('`allowed` is required');
  });

  it('reads every tracked document, in the fast tier, when neither is said', async () => {
    const check = docPlacement({ id: 'doc-placement', title: 't', allowed: [/^docs\//] });

    expect(check.tier).toBe('fast');
    expect(errorsOf(await runCheck(check, { tree: { 'NOTES.md': '# n' } }))[0]).toContain('NOTES.md sits where');
  });
});
