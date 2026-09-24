import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { docSymbols } from './doc-symbols.check';

const ID = { id: 'doc-symbols', title: 'symbols exist', tier: 'fast' as const };
const SUFFIXES = ['Service', 'Repository', 'ViewModel'];

const run = (
  tree: Record<string, string>,
  opts: Partial<Parameters<typeof docSymbols>[0]> = {},
  tracked?: readonly string[],
): Promise<IVerdict> =>
  runCheck(docSymbols({ ...ID, code: ['**/*.ts', '**/*.tsx'], docs: '**/*.md', suffixes: SUFFIXES, ...opts }), {
    tree,
    tracked,
  });

describe('docSymbols — a named symbol is declared somewhere', () => {
  it('is a product-zone check', () => {
    expect(docSymbols({ ...ID, code: ['**/*.ts'], docs: '**/*.md', suffixes: SUFFIXES }).zone).toBe('product');
  });

  it('flags a doc naming a suffixed symbol no code defines', async () => {
    const v = await run({ 'MOD.md': 'the `OrderCancelService` handles this', 'x.ts': 'export class OtherService {}' });

    expect(v.ok).toBe(false);
    expect(v.findings[0]).toMatchObject({ file: 'MOD.md', line: 1 });
    expect(errorsOf(v)[0]).toContain('`OrderCancelService`');
  });

  it('does not tell a non-TypeScript repository that ".ts" is where declarations live', async () => {
    // The declaration grammar is an option; a message hard-wired to ".ts" would send a
    // Python house looking for a file type it does not have.
    const v = await run({ 'app/models.py': 'x = 1\n', 'docs/guide.md': '`OrderService`' }, { code: ['**/*.py'] });

    expect(errorsOf(v)[0]).not.toContain('.ts');
    expect(errorsOf(v)[0]).toContain('nothing in the code corpus declares');
  });

  it('accepts a symbol declared in code', async () => {
    expect((await run({ 'MOD.md': 'see `OrderCancelService`', 'g.ts': 'export class OrderCancelService {}' })).ok).toBe(
      true,
    );
  });

  it('accepts a symbol whose NAME is only the filename (factory-built view models)', async () => {
    const tree = { 'MOD.md': 'the `AuthViewModel`', 'AuthViewModel.ts': 'export const useAuthViewModel = () => {}' };

    expect((await run(tree)).ok).toBe(true);
  });

  it('takes the name of a declaration file without its `.d` — `foo.d.ts` declares `foo`', async () => {
    const tree = { 'MOD.md': 'the `GlobalRepository`', 'types/GlobalRepository.d.ts': 'declare const x: number;' };

    expect((await run(tree)).ok).toBe(true);
  });

  it('does not flag a bare suffix used as a word, or a non-suffixed name', async () => {
    expect((await run({ 'MOD.md': 'every `Service` and every `Repository`', 'a.ts': '' })).ok).toBe(true);
    // Model is not a configured suffix.
    expect((await run({ 'MOD.md': 'the `OrderModel` value', 'a.ts': '' })).ok).toBe(true);
  });

  it('reports each stale name once, at the first document naming it', async () => {
    const v = await run({ 'a.md': '`AService`', 'b.md': '`AService` again', 'x.ts': '' });

    expect(v.findings.map((f) => f.file)).toEqual(['a.md']);
  });
});

describe('docSymbols — the exemptions and the ratchet', () => {
  it('honours the framework allowlist and the illustrative set', async () => {
    expect((await run({ 'MOD.md': 'catch a `ConfigService`', 'a.ts': '' }, { external: ['ConfigService'] })).ok).toBe(
      true,
    );
    const v = await run(
      { 'MOD.md': 'never write `OrderCreateService`', 'a.ts': '' },
      {
        illustrative: ['OrderCreateService'],
      },
    );
    expect(v.ok).toBe(true);
  });

  it('excludes built output from the code corpus — a stale `dist` must not keep a dead name alive', async () => {
    const tree = { 'MOD.md': '`LegacyService`', 'src/a.ts': '', 'dist/a.ts': 'export class LegacyService {}' };

    expect((await run(tree)).ok).toBe(true);
    expect((await run(tree, { except: ['dist'] })).ok).toBe(false);
    // A pathspec, so built output at any depth is `**/dist/**`.
    const nested = { 'MOD.md': '`OldService`', 'src/a.ts': '', 'pkg/dist/a.ts': 'export class OldService {}' };
    expect((await run(nested, { except: ['dist'] })).ok).toBe(true);
    expect((await run(nested, { except: ['**/dist/**'] })).ok).toBe(false);
  });

  it('skips snapshot trees and counts distinct names for the ratchet', async () => {
    const skipped = { 'docs/_plans/p.md': 'we will build `FutureService`', 'docs/a.md': '', 'a.ts': '' };
    expect((await run(skipped, { except: ['docs/_plans'] })).ok).toBe(true);

    const two = { 'a.md': '`AService` and `BService`', 'b.md': '`AService` again', 'x.ts': '' };
    // Two distinct names, three mentions: the ratchet counts what needs fixing.
    expect((await run(two, { ratchet: 2 })).ok).toBe(true);
    expect((await run(two, { ratchet: 1 })).ok).toBe(false);
  });

  it('skips a tracked file the file source cannot read, on either side', async () => {
    const v = await run({ 'a.md': '`GoneService`', 'a.ts': '' }, {}, ['a.md', 'a.ts', 'deleted.md', 'deleted.ts']);

    expect(errorsOf(v)).toHaveLength(1);
  });
});

describe('docSymbols — what it examined', () => {
  it('fails when the CODE corpus is empty — every symbol would be compared against nothing', async () => {
    const v = await run({ 'docs/guide.md': 'nothing named here' }, { code: ['src/**/*.ts'] });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('examined 0 code file(s) — `src/**/*.ts` matched nothing to read');
  });

  it('fails when the DOCUMENT corpus is empty — nothing read means every name "exists"', async () => {
    const v = await run({ 'src/a.ts': 'export class AService {}' }, { docs: 'handbook/**/*.md' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('examined 0 document(s) — `handbook/**/*.md` matched nothing to read');
  });

  it('fails when `except` swallowed every document', async () => {
    const v = await run({ 'docs/_plans/p.md': '`AService`', 'a.ts': '' }, { except: ['docs'] });

    expect(errorsOf(v)[0]).toContain('`except` exempted all of them');
  });

  it('holds both corpora to the floor it is given', async () => {
    const tree = { 'docs/a.md': '`AService`', 'src/a.ts': 'export class AService {}' };

    expect((await run(tree, { corpus: { atLeast: 2 } })).ok).toBe(false);
    expect((await run({ 'src/a.ts': '' }, { docs: 'none/*.md', corpus: { atLeast: 0 } })).ok).toBe(true);
  });

  it('prints the engine’s pass line, naming how many documents it read', async () => {
    const v = await run({ 'a.md': '`AService`', 'b.md': '', 'a.ts': 'export class AService {}' });

    expect(v.findings.map((f) => f.message)).toEqual(['✓ doc-symbols — 2 document(s) examined, clean']);
  });
});

describe('the declaration grammar is TypeScript by default, not by necessity', () => {
  // A Python module binding a name by assignment: no `class`, `const` or `type` keyword
  // for the TypeScript grammar to find.
  const PYTHON = {
    'app/services.py': 'OrderService = service_factory("orders")\n',
    'docs/guide.md': 'The `OrderService` owns this.',
  };

  it('a declaration the default grammar cannot see reads as missing — the honest failure', async () => {
    // The baseline for the case below: without an override this check reports a
    // documented, existing symbol as missing. Worse, arming the ratchet to quieten it
    // would leave a check that passes while verifying nothing.
    const v = await run(PYTHON, { code: ['**/*.py'] });

    expect(v.ok).toBe(false);
  });

  it('accepts a declaration grammar for another language', async () => {
    const v = await run(PYTHON, { code: ['**/*.py'], declaration: /^([A-Z]\w+)\s*=/gm });

    expect(v.ok).toBe(true);
  });

  it('accepts a different convention for how a symbol is written in prose', async () => {
    // A house that writes symbols as [[OrderService]] rather than in backticks.
    const v = await run(
      {
        'src/order.service.ts': 'export class OrderService {}',
        'docs/guide.md': 'See [[MissingService]] for details.',
      },
      { symbolRef: /\[\[([A-Z][A-Za-z0-9]{4,})\]\]/g },
    );

    expect(v.ok).toBe(false);
    expect(errorsOf(v).join('\n')).toContain('MissingService');
  });
});
