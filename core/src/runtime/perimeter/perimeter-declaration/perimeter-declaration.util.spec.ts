import { describe, expect, it } from 'vitest';

import type { IAgentRuntime, IPerimeterPolicy } from '../../../domain';
import { perimeterDeclaration } from './perimeter-declaration.util';

const policy = { id: 'no-force-push' } as unknown as IPerimeterPolicy;
const runtime = { name: 'custom' } as unknown as IAgentRuntime;

describe('perimeterDeclaration — every shape perimeter.mjs may export, read one way', () => {
  it.each([
    ['named `policies` and `runtime`', { policies: [policy], runtime }, [policy], runtime],
    ['a default array of policies', { default: [policy] }, [policy], undefined],
    ['a default object', { default: { policies: [policy], runtime } }, [policy], runtime],
    ['named exports over the default', { policies: [policy], default: { policies: [], runtime } }, [policy], runtime],
    ['nothing at all', {}, [], undefined],
  ])('%s', (_, mod, policies, expected) => {
    const read = perimeterDeclaration(mod as never);
    expect(read.policies).toEqual(policies);
    expect(read.runtime).toBe(expected);
  });

  // Read as "no policies", a file still exporting the old name enforced nothing, in silence.
  it.each([
    ['named', { rules: [policy] }],
    ['in the default object', { default: { rules: [policy] } }],
  ])('refuses the old `rules` export, %s, naming the rename', (_, mod) => {
    expect(() => perimeterDeclaration(mod as never)).toThrow(
      'perimeter.mjs exports `rules`, and the export is now `policies`',
    );
  });
});
