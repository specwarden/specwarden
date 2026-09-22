import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../../../infrastructure';
import { inferSibling } from './infer-sibling.util';

describe('inferSibling', () => {
  it('measures consistency and lists the exceptions', () => {
    const files = new InMemoryFileSource({
      'a.service.ts': '',
      'a.service.spec.ts': '',
      'b.service.ts': '',
      'b.service.spec.ts': '',
      'c.service.ts': '', // no spec — the one exception
    });
    const inf = inferSibling(files, '**/*.service.ts', '{name}.spec.ts');
    expect(inf.total).toBe(3);
    expect(inf.satisfied).toBe(2);
    expect(inf.ratio).toBeCloseTo(2 / 3);
    expect(inf.exceptions).toEqual(['c.service.ts']);
  });

  it('is a ratio of 1 with no exceptions when the habit is universal', () => {
    const files = new InMemoryFileSource({ 'a.service.ts': '', 'a.service.spec.ts': '' });
    const inf = inferSibling(files, '**/*.service.ts', '{name}.spec.ts');
    expect(inf.ratio).toBe(1);
    expect(inf.exceptions).toEqual([]);
  });

  it('is a ratio of 0 when nothing matches', () => {
    expect(inferSibling(new InMemoryFileSource({}), '**/*.service.ts', '{name}.spec.ts').ratio).toBe(0);
  });
});
