import { describe, expect, it } from 'vitest';

import type { IAgentRuntime, IPerimeterRule } from '../../../domain';
import { perimeterDeclaration } from './perimeter-declaration.util';

const rule = { id: 'no-force-push' } as unknown as IPerimeterRule;
const runtime = { name: 'custom' } as unknown as IAgentRuntime;

describe('perimeterDeclaration — every shape perimeter.mjs may export, read one way', () => {
  it.each([
    ['named `rules` and `runtime`', { rules: [rule], runtime }, [rule], runtime],
    ['a default array of rules', { default: [rule] }, [rule], undefined],
    ['a default object', { default: { rules: [rule], runtime } }, [rule], runtime],
    ['named exports over the default', { rules: [rule], default: { rules: [], runtime } }, [rule], runtime],
    ['nothing at all', {}, [], undefined],
  ])('%s', (_, mod, rules, expected) => {
    const read = perimeterDeclaration(mod as never);
    expect(read.rules).toEqual(rules);
    expect(read.runtime).toBe(expected);
  });
});
