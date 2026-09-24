import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { DOC_PATH_RE, docPaths } from './doc-paths.check';

const ID = { id: 'doc-paths', title: 'paths resolve', tier: 'fast' as const };

const run = (
  tree: Record<string, string>,
  opts: Partial<Parameters<typeof docPaths>[0]> = {},
  extra: { threshold?: number } = {},
): Promise<IVerdict> =>
  runCheck(
    docPaths({
      ...ID,
      docs: '**/*.md',
      prefixes: ['{ws}/src/', 'server/src/'],
      externalPrefixes: ['reports/'],
      ...opts,
    }),
    { tree, ...extra },
  );

describe('docPaths — what counts as a pointer', () => {
  it('is a product-zone check', () => {
    expect(docPaths({ ...ID, docs: '**/*.md' }).zone).toBe('product');
  });

  it('flags a backticked path that does not resolve, with the line it is on', async () => {
    const v = await run({ 'docs/a.md': 'intro\n\nsee `server/src/gone.ts` for details', 'server/src/present.ts': '' });

    expect(v.ok).toBe(false);
    expect(v.findings[0]).toMatchObject({ file: 'docs/a.md', line: 3 });
    expect(errorsOf(v)[0]).toContain('`server/src/gone.ts`, which does not resolve');
  });

  it('does not flag prose that merely mentions a directory — only backticked file paths count', async () => {
    expect((await run({ 'docs/a.md': 'the server/src directory holds the backend' })).ok).toBe(true);
    // Backticked, but not a FILE: no extension from the set, so not a pointer.
    expect((await run({ 'docs/a.md': 'the `server/src` directory' })).ok).toBe(true);
  });

  it('matches only the file shapes it declares', () => {
    const refs = (text: string) => [...text.matchAll(DOC_PATH_RE)].map((m) => m[1]);

    expect(refs('`a/b.ts` `a/b.yml` `a/b.png` `plain.ts`')).toEqual(['a/b.ts', 'a/b.yml']);
  });

  it('reports a path named twice in one document once', async () => {
    const v = await run({ 'docs/a.md': '`server/src/gone.ts` and again `server/src/gone.ts`' });

    expect(errorsOf(v)).toHaveLength(1);
  });
});

describe('docPaths — where a path may resolve', () => {
  it('resolves a path relative to the document’s own directory', async () => {
    // `constants/x.ts` inside server/src/mod/MOD.md resolves at server/src/mod/constants/x.ts.
    const tree = { 'server/src/mod/MOD.md': 'the enum lives in `constants/x.ts`', 'server/src/mod/constants/x.ts': '' };

    expect((await run(tree)).ok).toBe(true);
  });

  it('resolves against an ANCESTOR of the document’s directory', async () => {
    // Outside every configured root, so only the ancestor walk can resolve it.
    const tree = { 'lib/pkg/deep/MOD.md': 'see `pkg/util/y.ts`', 'lib/pkg/util/y.ts': '' };

    expect((await run(tree)).ok).toBe(true);
    expect((await run(tree, { prefixes: [] })).ok).toBe(true);
    expect((await run({ 'lib/pkg/deep/MOD.md': 'see `pkg/util/y.ts`' }, { prefixes: [] })).ok).toBe(false);
  });

  it('resolves a path in a document at the repository root', async () => {
    expect((await run({ 'README.md': 'start at `src/main.ts`', 'src/main.ts': '' })).ok).toBe(true);
    expect((await run({ 'README.md': 'start at `src/gone.ts`' })).ok).toBe(false);
  });

  it('resolves against a configured workspace root', async () => {
    expect((await run({ 'docs/a.md': 'the schema is `server/src/schema.ts`', 'server/src/schema.ts': '' })).ok).toBe(
      true,
    );
  });

  it('substitutes the document’s own workspace into `{ws}`', async () => {
    // `web/README.md` naming `app/page.ts` means web/src/app/page.ts; the same words in
    // another workspace mean a different file, and must not borrow this one.
    expect((await run({ 'web/README.md': 'see `app/page.ts`', 'web/src/app/page.ts': '' })).ok).toBe(true);
    expect((await run({ 'api/README.md': 'see `app/page.ts`', 'web/src/app/page.ts': '' })).ok).toBe(false);
  });

  it('treats a scoped-package specifier as external (assumed present)', async () => {
    expect((await run({ 'docs/a.md': 'styles come from `@scope/ui-kit/dist/styles.css`' })).ok).toBe(true);
  });

  it('treats a configured sibling checkout as external', async () => {
    expect((await run({ 'docs/a.md': 'the numbers are in `reports/2026/q3.md`' })).ok).toBe(true);
  });

  it('resolves an @alias by its bare form', async () => {
    expect((await run({ 'docs/a.md': 'see `@shared/util.ts`', 'shared/util.ts': '' })).ok).toBe(true);
  });
});

describe('docPaths — the exemptions and the ratchet', () => {
  it('honours the illustrative allowlist', async () => {
    const v = await run({ 'docs/a.md': 'the deleted `server/src/GONE.md`' }, { illustrative: ['server/src/GONE.md'] });

    expect(v.ok).toBe(true);
  });

  it('leaves out what `except` names, and still reads the rest', async () => {
    const tree = { 'docs/_plans/p.md': 'we will create `server/src/new.ts`', 'docs/a.md': 'see `server/src/gone.ts`' };

    expect(errorsOf(await run(tree, { except: ['docs/_plans'] })).map((m) => m.split(' ')[0])).toEqual(['docs/a.md']);
    // A pathspec, as git reads one: a trailing slash names the same directory, a glob its matches.
    expect(errorsOf(await run(tree, { except: ['docs/_plans/'] }))).toHaveLength(1);
    expect(errorsOf(await run(tree, { except: ['**/_plans/*.md'] }))).toHaveLength(1);
  });

  it('reads several pathspecs as one corpus', async () => {
    const tree = { 'README.md': 'see `src/gone.ts`', 'docs/a.md': 'see `src/lost.ts`', 'vendor/b.md': '`src/x.ts`' };

    expect(errorsOf(await run(tree, { docs: ['README.md', 'docs/**/*.md'] }))).toHaveLength(2);
  });

  it('holds under a ratchet and fails on an increase', async () => {
    const tree = { 'docs/a.md': '`server/src/x.ts` and `server/src/y.ts`' };

    expect((await run(tree, { ratchet: 2 })).ok).toBe(true);
    expect((await run(tree, { ratchet: 1 })).ok).toBe(false);
  });

  it('prefers the STORED ratchet the run hands it over the option', async () => {
    // `--tighten` stores the measurement; an option left at its first value must not
    // loosen the check past what the store says.
    const tree = { 'docs/a.md': '`server/src/x.ts` and `server/src/y.ts`' };

    expect((await run(tree, { ratchet: 5 }, { threshold: 1 })).ok).toBe(false);
  });
});

describe('docPaths — what it examined', () => {
  it('fails, naming the pathspec, when no document matched', async () => {
    const v = await run({ 'src/index.ts': '' }, { docs: 'handbook/**/*.md' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('examined 0 document(s) — `handbook/**/*.md` matched nothing to read');
  });

  it('fails when `except` swallowed the whole corpus, and says so', async () => {
    // An exemption that covers everything leaves the check as unable to fail as an empty
    // pathspec does.
    const v = await run({ 'docs/_plans/p.md': '`server/src/gone.ts`' }, { except: ['docs'] });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('`except` exempted all of them');
  });

  it('holds to the floor it is given — `atLeast: 0` accepts an empty corpus, a higher one refuses a thin one', async () => {
    expect((await run({ 'src/index.ts': '' }, { docs: 'handbook/**/*.md', corpus: { atLeast: 0 } })).ok).toBe(true);
    expect((await run({ 'a.md': '# a' }, { corpus: { atLeast: 2 } })).ok).toBe(false);
  });

  it('prints the engine’s pass line, naming how many documents it read', async () => {
    const v = await run({ 'a.md': '# a', 'b.md': '# b' });

    expect(v.findings.map((f) => f.message)).toEqual(['✓ doc-paths — 2 document(s) examined, clean']);
  });

  it('reads the root README under `**/*.md` — the pathspec spans zero directories too', async () => {
    const v = await run({ 'README.md': 'see `src/gone.ts`' }, { docs: '**/*.md' });

    expect(errorsOf(v)[0]).toContain('README.md names `src/gone.ts`');
  });
});
