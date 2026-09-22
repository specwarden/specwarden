import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from 'specwarden';
import { InMemoryFileSource } from 'specwarden';
import { docSymbols } from './doc-symbols.check';

const ID = { id: 'doc-symbols', title: 'symbols exist', tier: 'fast' as const };
const SUFFIXES = ['Service', 'Repository', 'ViewModel'];

function run(files: Record<string, string>, opts: Partial<Parameters<typeof docSymbols>[0]> = {}): IVerdict {
  const source = new InMemoryFileSource(files);
  const names = Object.keys(files);
  const match = (spec: string): string[] => {
    const ext = spec.replace('*', '');
    return names.filter((f) => f.endsWith(ext));
  };
  const check = docSymbols({ ...ID, code: ['*.ts', '*.tsx'], docs: '*.md', suffixes: SUFFIXES, ...opts });
  const ctx = { changed: [], files: source, vcs: { trackedFiles: match } } as unknown as ICheckContext;
  return check.run(ctx) as IVerdict;
}

describe('docSymbols', () => {
  it('is a product-zone check', () => {
    expect(docSymbols({ ...ID, code: ['*.ts'], docs: '*.md', suffixes: SUFFIXES }).zone).toBe('product');
  });

  it('flags a doc naming a suffixed symbol no code defines', () => {
    const v = run({ 'MOD.md': 'the `GapCancelService` handles this', 'x.ts': 'export class OtherService {}' });
    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('GapCancelService');
  });

  it('accepts a symbol declared in code', () => {
    expect(run({ 'MOD.md': 'see `GapCancelService`', 'g.ts': 'export class GapCancelService {}' }).ok).toBe(true);
  });

  it('accepts a symbol whose NAME is only the filename (factory-built view models)', () => {
    expect(
      run({ 'MOD.md': 'the `AuthViewModel`', 'AuthViewModel.ts': 'export const useAuthViewModel = () => {}' }).ok,
    ).toBe(true);
  });

  it('does not flag a bare suffix used as a word, or a non-suffixed name', () => {
    expect(run({ 'MOD.md': 'every `Service` and every `Repository`' }).ok).toBe(true);
    expect(run({ 'MOD.md': 'the `GapModel` value' }).ok).toBe(true); // Model is not a configured suffix
  });

  it('honours the framework allowlist and the illustrative set', () => {
    expect(run({ 'MOD.md': 'catch a `ConfigService`' }, { external: ['ConfigService'] }).ok).toBe(true);
    expect(run({ 'MOD.md': 'never write `GapCreateService`' }, { illustrative: ['GapCreateService'] }).ok).toBe(true);
  });

  it('skips snapshot trees and counts distinct names for the ratchet', () => {
    expect(run({ 'docs/_plans/p.md': 'we will build `FutureService`' }, { skipDirs: ['docs/_plans/'] }).ok).toBe(true);
    const two = { 'a.md': '`AService` and `BService`', 'b.md': '`AService` again' };
    expect(run(two, { ratchet: 2 }).ok).toBe(true); // two distinct names
    expect(run(two, { ratchet: 1 }).ok).toBe(false);
  });
});

describe('the declaration grammar is TypeScript by default, not by necessity', () => {
  it('a Python declaration is invisible to the default grammar — the honest failure', () => {
    // Left here as the baseline for the test below: without an override this check
    // reports a documented, existing symbol as missing. Worse, arming the ratchet to
    // quieten it would leave a check that passes while verifying nothing.
    const v = run({
      'app/models.py': 'class OrderService:\n    pass\n',
      'docs/guide.md': 'The `OrderService` owns this.',
    });
    expect(v.ok).toBe(false);
  });

  it('accepts a declaration grammar for another language', () => {
    const v = run(
      {
        'app/models.py': 'class OrderService:\n    pass\n',
        'docs/guide.md': 'The `OrderService` owns this.',
      },
      { code: ['*.py'], declaration: /(?:class|def)\s+(\w+)/g },
    );
    expect(v.ok).toBe(true);
  });

  it('accepts a different convention for how a symbol is written in prose', () => {
    // A house that writes symbols as [[OrderService]] rather than in backticks.
    const v = run(
      {
        'src/order.service.ts': 'export class OrderService {}',
        'docs/guide.md': 'See [[MissingService]] for details.',
      },
      { symbolRef: /\[\[([A-Z][A-Za-z0-9]{4,})\]\]/g },
    );
    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('MissingService'))).toBe(true);
  });
});
