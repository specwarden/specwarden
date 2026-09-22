import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from 'specwarden';
import { InMemoryFileSource } from 'specwarden';
import { docPaths } from './doc-paths.check';

const ID = { id: 'doc-paths', title: 'paths resolve', tier: 'fast' as const };

function run(files: Record<string, string>, opts: Partial<Parameters<typeof docPaths>[0]> = {}): IVerdict {
  const source = new InMemoryFileSource(files);
  const tracked = Object.keys(files).filter((f) => f.endsWith('.md'));
  const check = docPaths({
    ...ID,
    docs: '*.md',
    prefixes: ['{ws}/src/', 'be/src/'],
    externalPrefixes: ['adat-reports/'],
    ...opts,
  });
  const ctx = { changed: [], files: source, vcs: { trackedFiles: () => tracked } } as unknown as ICheckContext;
  return check.run(ctx) as IVerdict;
}

describe('docPaths', () => {
  it('is a product-zone check', () => {
    expect(docPaths({ ...ID, docs: '*.md' }).zone).toBe('product');
  });

  it('flags a backticked path that does not resolve', () => {
    const v = run({ 'docs/a.md': 'see `be/src/gone.ts` for details', 'be/src/present.ts': '' });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('be/src/gone.ts');
  });

  it('resolves a path relative to the document’s own directory', () => {
    // `constants/x.ts` inside be/src/mod/MOD.md resolves at be/src/mod/constants/x.ts.
    const v = run({ 'be/src/mod/MOD.md': 'the enum lives in `constants/x.ts`', 'be/src/mod/constants/x.ts': '' });
    expect(v.ok).toBe(true);
  });

  it('resolves against a configured workspace root', () => {
    const v = run({ 'docs/a.md': 'the schema is `be/src/schema.ts`', 'be/src/schema.ts': '' });
    expect(v.ok).toBe(true);
  });

  it('treats a scoped-package specifier as external (assumed present)', () => {
    const v = run({ 'docs/a.md': 'styles come from `@telegram-apps/telegram-ui/dist/styles.css`' });
    expect(v.ok).toBe(true);
  });

  it('resolves an @alias by its bare form', () => {
    const v = run({ 'docs/a.md': 'see `@shared/util.ts`', 'shared/util.ts': '' });
    expect(v.ok).toBe(true);
  });

  it('honours the illustrative allowlist and the skipped trees', () => {
    expect(run({ 'docs/a.md': 'the deleted `be/src/GONE.md`' }, { illustrative: ['be/src/GONE.md'] }).ok).toBe(true);
    expect(run({ 'docs/_plans/p.md': 'we will create `be/src/new.ts`' }, { skipDirs: ['docs/_plans/'] }).ok).toBe(true);
  });

  it('does not flag prose that merely mentions a directory (only backticked paths count)', () => {
    const v = run({ 'docs/a.md': 'the be/src directory holds the backend' });
    expect(v.ok).toBe(true);
  });

  it('holds under a ratchet and fails on an increase', () => {
    const files = { 'docs/a.md': '`be/src/x.ts` and `be/src/y.ts`' };
    expect(run(files, { ratchet: 2 }).ok).toBe(true);
    expect(run(files, { ratchet: 1 }).ok).toBe(false);
  });
});
