import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from '../../domain';
import { InMemoryFileSource } from '../../infrastructure';
import { zoneBoundary } from './zone-boundary.check';

const ID = { id: 'zone-boundary', title: 'the P/C barrier holds', tier: 'fast' as const };

const LITERALS = [
  { label: 'be/ (a host workspace)', pattern: /(^|[^\w])be\//m },
  { label: 'gap (a host domain noun)', pattern: /\bgap\b/i },
];

function run(files: InMemoryFileSource, opts: Partial<Parameters<typeof zoneBoundary>[0]> = {}): IVerdict {
  const check = zoneBoundary({ ...ID, productSources: 'src/**/*.ts', except: ['src/**/*.spec.ts'], forbiddenLiterals: LITERALS, consumerImport: /\.specwarden\//, ...opts });
  return check.run({ changed: [], files } as unknown as ICheckContext) as IVerdict;
}

describe('zoneBoundary', () => {
  it('is a product-zone check', () => {
    expect(zoneBoundary({ ...ID, productSources: 'src/**', forbiddenLiterals: [] }).zone).toBe('product');
  });

  it('flags a product source that names a host literal', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': '// a query lives in be/repositories\n' }));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('be/ (a host workspace)');
    expect(v.findings[0].line).toBe(1);
  });

  it('flags an import reaching into the consumer zone', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': "import { x } from '../../../.specwarden/checks/y.mjs';\n" }));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('consumer zone');
  });

  it('does not flag prose that merely contains the letters', () => {
    // camelCase / compound words have no boundary before the token.
    const v = run(new InMemoryFileSource({ 'src/a.ts': 'const m = loadMeeting(); // a gapless, beforehand swap\n' }));
    expect(v.ok).toBe(true);
  });

  it('exempts the product tests that legitimately name literals', () => {
    const v = run(new InMemoryFileSource({ 'src/a.spec.ts': "expect(scan('be/foo')).toContain('gap');\n" }));
    expect(v.ok).toBe(true);
    expect(v.findings).toHaveLength(0);
  });

  it('passes a clean product tree', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': "import { y } from './b';\nexport const z = 1;\n" }));
    expect(v.ok).toBe(true);
  });

  it('reports every distinct host literal a file names', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': '// runs once per gap, over be/state\n' }));
    const labels = v.findings.map((f) => f.message);
    expect(labels.some((m) => m.includes('be/'))).toBe(true);
    expect(labels.some((m) => m.includes('gap'))).toBe(true);
  });
});
