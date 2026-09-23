import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from '../../domain';
import { InMemoryFileSource } from '../../infrastructure';
import { matchPathspec } from '../../infrastructure/git-vcs/git-pathspec/git-pathspec.util';
import { zoneBoundary } from './zone-boundary.check';

const ID = { id: 'zone-boundary', title: 'the P/C barrier holds', tier: 'fast' as const };

const LITERALS = [
  { label: 'backend/ (a host workspace)', pattern: /(^|[^\w])backend\//m },
  { label: 'invoice (a host domain noun)', pattern: /\binvoice\b/i },
];

/** Every file in the source, as version control would list it: the sweep reads the TRACKED set. */
const trackedOver = (files: InMemoryFileSource) => ({
  trackedFiles: (pathspec?: string) =>
    matchPathspec(pathspec, [...(files as unknown as { files: Map<string, string> }).files.keys()]),
});

function run(files: InMemoryFileSource, opts: Partial<Parameters<typeof zoneBoundary>[0]> = {}): IVerdict {
  const check = zoneBoundary({
    ...ID,
    productSources: 'src/**/*.ts',
    except: ['src/**/*.spec.ts'],
    forbiddenLiterals: LITERALS,
    consumerImport: /\.specwarden\//,
    ...opts,
  });
  return check.run({ changed: [], files, vcs: trackedOver(files) } as unknown as ICheckContext) as IVerdict;
}

describe('zoneBoundary', () => {
  it('is a product-zone check', () => {
    expect(zoneBoundary({ ...ID, productSources: 'src/**', forbiddenLiterals: [] }).zone).toBe('product');
  });

  it('flags a product source that names a host literal', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': '// a query lives in backend/repositories\n' }));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('backend/ (a host workspace)');
    expect(v.findings[0].line).toBe(1);
  });

  it('flags an import reaching into the consumer zone', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': "import { x } from '../../../.specwarden/checks/y.mjs';\n" }));
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('consumer zone');
  });

  it('does not flag prose that merely contains the letters', () => {
    // camelCase / compound words have no boundary before the token.
    const v = run(new InMemoryFileSource({ 'src/a.ts': 'const m = loadInvoice(); // invoiced, mybackend/2\n' }));
    expect(v.ok).toBe(true);
  });

  it('exempts the product tests that legitimately name literals', () => {
    const v = run(
      new InMemoryFileSource({
        'src/a.spec.ts': "expect(scan('backend/foo')).toContain('invoice');\n",
        'src/a.ts': 'export const a = 1;\n',
      }),
    );
    expect(v.ok).toBe(true);
    expect(v.findings.filter((f) => f.severity === 'error')).toHaveLength(0);
  });

  it('passes a clean product tree', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': "import { y } from './b';\nexport const z = 1;\n" }));
    expect(v.ok).toBe(true);
  });

  it('reports every distinct host literal a file names', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': '// runs once per invoice, over backend/state\n' }));
    const labels = v.findings.map((f) => f.message);
    expect(labels.some((m) => m.includes('backend/'))).toBe(true);
    expect(labels.some((m) => m.includes('invoice'))).toBe(true);
  });
});

describe('zoneBoundary — the edges of the sweep', () => {
  it('reports the line a literal first appears on, not the top of the file', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': 'export const a = 1;\n\n// see backend/state\n' }));

    expect(v.findings.map((f) => f.line)).toEqual([3]);
  });

  it('reports one finding per literal per file, however often the file names it', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': '// backend/a\n// backend/b\n// backend/c\n' }));

    expect(v.findings).toHaveLength(1);
  });

  it('finds a literal in every file when its pattern is ALREADY global — no lastIndex carried over', () => {
    const v = run(
      new InMemoryFileSource({ 'src/a.ts': 'x backend/1', 'src/b.ts': 'x backend/2', 'src/c.ts': 'x backend/3' }),
      { forbiddenLiterals: [{ label: 'backend/', pattern: /backend\//g }] },
    );

    expect(v.findings.map((f) => f.file)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  /**
   * P reaching into C by a dynamic `import()` is the same one-way violation as a static
   * one, and the spelling a loader would naturally use.
   */
  it('refuses a DYNAMIC import into the consumer zone', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': "const c = await import('../../.specwarden/rules.mjs');\n" }));

    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('reaching into the consumer zone');
  });

  it('takes the consumer import as a string prefix too', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': "import x from '@host/checks/y';\n" }), {
      consumerImport: '@host/checks',
    });

    expect(v.ok).toBe(false);
  });

  it('checks literals alone when no consumer import is declared', () => {
    const v = run(new InMemoryFileSource({ 'src/a.ts': "import x from '../../.specwarden/y';\n" }), {
      consumerImport: undefined,
    });

    expect(v.ok).toBe(true);
  });

  it('sweeps every product source when nothing is exempt', () => {
    const v = run(new InMemoryFileSource({ 'src/a.spec.ts': '// backend/x\n' }), { except: undefined });

    expect(v.ok).toBe(false);
  });

  it('holds at a ratchet for a barrier armed against a tree that still leaks', () => {
    const tree = new InMemoryFileSource({ 'src/a.ts': '// backend/x\n' });

    expect(run(tree, { ratchet: 1 }).ok).toBe(true);
    expect(run(tree, { ratchet: 0 }).ok).toBe(false);
  });

  /**
   * A `productSources` glob that matches nothing used to sweep nothing and pass. A barrier
   * pointed at a folder that moved is a barrier around nothing, and it is now refused.
   */
  it('refuses a product glob that matched no source — a barrier around nothing is not a barrier', () => {
    const v = run(new InMemoryFileSource({ 'lib/a.ts': '// backend/x\n' }));

    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('`src/**/*.ts` matched no product source to sweep');
  });

  it('accepts an empty sweep only when the check says so in writing', () => {
    const v = run(new InMemoryFileSource({ 'lib/a.ts': '// backend/x\n' }), { corpus: { atLeast: 0 } });

    expect(v.ok).toBe(true);
  });
});
