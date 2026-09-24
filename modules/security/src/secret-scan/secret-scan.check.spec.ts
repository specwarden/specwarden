import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { secretScan } from './secret-scan.check';

const ID = { title: 'no secrets' };

// Fixtures are built by CONCATENATION so this spec file's own source never contains
// a literal credential-shaped string — otherwise the repository's secret scan would
// flag the test that tests it. Each value only takes its dangerous shape at runtime.
const AWS = 'AK' + 'IA' + 'ABCDEFGH12345678';
const TELEGRAM = '12345678' + ':A' + 'A' + 'z'.repeat(35);
const PRIVATE_KEY = '-----BEGIN ' + 'PRIVATE KEY-----';

/** An ordinary file, so a case about SKIPPING one file is not also a case about an empty corpus. */
const ORDINARY = { 'src/index.ts': 'export const answer = 42;\n' };

const run = (
  tree: Record<string, string>,
  opts: Partial<Parameters<typeof secretScan>[0]> = {},
  extra: { tracked?: readonly string[]; threshold?: number } = {},
): Promise<IVerdict> => runCheck(secretScan({ ...ID, ...opts }), { tree, ...extra });

describe('secretScan — what it catches', () => {
  it('is a product-zone check', () => {
    expect(secretScan({ ...ID }).zone).toBe('product');
  });

  it('catches an AWS key id, a Telegram token and a private-key block', async () => {
    expect((await run({ 'a.ts': `const k = "${AWS}"` })).ok).toBe(false);
    expect((await run({ 'b.env': `TOKEN=${TELEGRAM}` })).ok).toBe(false);
    expect((await run({ 'c.pem': `${PRIVATE_KEY}\n` })).ok).toBe(false);
  });

  it('names the file, the line and the pattern, and says to ROTATE before deleting', async () => {
    const v = await run({ 'config/app.ts': `// keys\nconst k = "${AWS}"` });

    expect(v.findings[0]).toMatchObject({ file: 'config/app.ts', line: 2 });
    expect(errorsOf(v)[0]).toMatch(/^config\/app\.ts:2 — .*\[aws-access-key-id\]\. If real, ROTATE it/);
  });

  it('catches a bare secret env key (no prefix), not only a prefixed one', async () => {
    // 32 hex chars, concatenated so this file carries no literal secret shape.
    const HEX = '0123456789abcdef'.repeat(2);
    // The env-assignment pattern is the only one that can match these — the value is
    // plain hex, not a Telegram/AWS/key shape.
    expect((await run({ 'a.env': `PASSWORD=${HEX}` })).ok).toBe(false);
    expect((await run({ 'b.env': `SECRET=${HEX}` })).ok).toBe(false);
    expect((await run({ 'c.env': `DB_PASSWORD=${HEX}` })).ok).toBe(false);
    // A readable value under a secret key stays allowed — the shape, not the key, gates.
    expect((await run({ 'd.env': 'PASSWORD=hunter2' })).ok).toBe(true);
  });

  it('reads a dotfile — git tracks a `.env` like anything else', async () => {
    expect((await run({ '.env': `TOKEN=${TELEGRAM}` })).ok).toBe(false);
  });

  it('lets an ordinary file through', async () => {
    expect((await run({ 'a.ts': 'export const CART_STORAGE_KEY = "cart-context";\n' })).ok).toBe(true);
  });

  it('holds known findings under a ratchet, preferring the stored one', async () => {
    const tree = { 'a.ts': `const k = "${AWS}"` };

    expect((await run(tree, { ratchet: 1 })).ok).toBe(true);
    expect((await run(tree, { ratchet: 1 }, { threshold: 0 })).ok).toBe(false);
  });
});

describe('secretScan — what it lets through, and why', () => {
  it('suppresses a placeholder-marked match', async () => {
    expect((await run({ 'a.env': `KEY=${AWS} # EXAMPLE only` })).ok).toBe(true);
    expect((await run({ 'b.env': `KEY=\${SOME_VAR}${AWS}` })).ok).toBe(true);
  });

  it('honours an exact-file allowlist entry', async () => {
    const allowlist = [{ file: 'fixtures/known.txt', patternId: '*' }];

    expect((await run({ 'fixtures/known.txt': `k=${AWS}` }, { allowlist })).ok).toBe(true);
    // …but only for the named file, never a lookalike elsewhere.
    expect((await run({ 'other.txt': `k=${AWS}` }, { allowlist })).ok).toBe(false);
  });

  it('an allowlist entry for one pattern id does not excuse a different pattern', async () => {
    // The file is allowlisted for aws-access-key-id only; a Telegram token in it must
    // still be flagged.
    const allowlist = [{ file: 'k.env', patternId: 'aws-access-key-id' }];

    expect((await run({ 'k.env': `AWS=${AWS}\nTG=${TELEGRAM}` }, { allowlist })).ok).toBe(false);
    // …and with the telegram token gone, the aws allowlist entry passes.
    expect((await run({ 'k.env': `AWS=${AWS}` }, { allowlist })).ok).toBe(true);
  });

  it('skips lockfiles, a skipped folder anywhere in the tree, skipped extensions and binary content', async () => {
    expect((await run({ 'pnpm-lock.yaml': `k=${AWS}`, ...ORDINARY })).ok).toBe(true);
    expect((await run({ 'packages/a/dist/bundle.js': `k=${AWS}`, ...ORDINARY })).ok).toBe(true);
    expect((await run({ 'logo.png': `k=${AWS}`, ...ORDINARY })).ok).toBe(true);
    expect((await run({ 'blob.txt': `\0binary ${AWS}`, ...ORDINARY })).ok).toBe(true);
  });

  it('reads a file with no extension — the extension skip must not swallow it', async () => {
    expect((await run({ Dockerfile: `ENV TOKEN=${TELEGRAM}` })).ok).toBe(false);
  });

  it('leaves out what `except` names, on top of the defaults it keeps', async () => {
    const tree = { 'fixtures/leak.env': `k=${AWS}`, 'pnpm-lock.yaml': `k=${AWS}`, ...ORDINARY };

    expect((await run(tree)).ok).toBe(false);
    // Replacing the defaults to add one folder dropped every lockfile from them; `except` adds.
    expect((await run(tree, { except: ['fixtures/**'] })).ok).toBe(true);
  });

  it('refuses the old `skipPaths`, `skipExtensions` and `scan` by name', () => {
    expect(() => secretScan({ skipPaths: [] } as never)).toThrow('`skipPaths` is not an option of secretScan');
    expect(() => secretScan({ skipExtensions: [] } as never)).toThrow('`skipExtensions` is not an option');
    expect(() => secretScan({ scan: 'src' } as never)).toThrow('`scan` is not an option of secretScan');
  });

  it('skips a file larger than maxBytes', async () => {
    const big = `padding `.repeat(50) + `k=${AWS}`;

    // Caught under the 1 MiB default…
    expect((await run({ 'a.txt': big, ...ORDINARY })).ok).toBe(false);
    // …and over the cap, not scanned.
    expect((await run({ 'a.txt': big, ...ORDINARY }, { maxBytes: 32 })).ok).toBe(true);
  });

  it('skips a tracked file the file source cannot read', async () => {
    expect((await run(ORDINARY, {}, { tracked: ['src/index.ts', 'deleted.env'] })).ok).toBe(true);
  });
});

describe('secretScan — what it examined', () => {
  it('scans every tracked file when no pathspec is given — the empty pathspec is EVERYTHING', async () => {
    // Forwarded to a glob, an empty pathspec matches nothing: a credential scan once passed
    // over a tree with a credential in it for exactly that reason.
    expect((await run({ 'deep/down/x.env': `TOKEN=${TELEGRAM}` })).ok).toBe(false);
  });

  it('scans only what a narrowed pathspec selects', async () => {
    const tree = { 'config/a.env': 'A=1', 'scratch/b.env': `TOKEN=${TELEGRAM}` };

    expect((await run(tree, { files: 'config' })).ok).toBe(true);
    expect((await run(tree, { files: ['config', 'scratch'] })).ok).toBe(false);
  });

  it('fails, naming the pathspec, when it matched no file — "no credentials" about nothing is the worst false green', async () => {
    const v = await run(ORDINARY, { files: 'deploy/**' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toHaveLength(1);
    expect(errorsOf(v)[0]).toContain(
      'examined 0 file(s) — `deploy/**`, less `except` and the default exemptions, left nothing to scan — below the floor of 1.',
    );
  });

  it('fails when the skipped paths swallowed every file', async () => {
    const v = await run({ 'pnpm-lock.yaml': 'lockfileVersion: 9', 'logo.png': '' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('every tracked file, less `except` and the default exemptions');
  });

  it('prints the engine’s pass line, and accepts an empty corpus only when it is said in writing', async () => {
    const v = await run(ORDINARY);
    expect(v.findings[0]?.message).toBe('✓ secret-scan — 1 file(s) examined, clean');

    expect((await run({ 'logo.png': '' }, { corpus: { atLeast: 0 } })).ok).toBe(true);
  });
});

describe('the credential library is a preset, not a mandate', () => {
  const withFile = (body: string, opts: Partial<Parameters<typeof secretScan>[0]> = {}) =>
    run({ 'app.ts': body }, opts);

  const LINE = `const k = "${AWS}";`;

  it('scans for the built-ins when the caller says nothing', async () => {
    const v = await withFile(LINE);

    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('aws-access-key-id'))).toBe(true);
  });

  it('lets a repository switch off a vendor it does not use — with a reason, said out loud', async () => {
    const v = await withFile(LINE, {
      patterns: { disable: [{ id: 'aws-access-key-id', why: 'no AWS account anywhere in this org' }] },
    });

    expect(v.ok).toBe(true);
    expect(v.findings.some((f) => f.severity === 'info' && f.message.includes('no AWS account'))).toBe(true);
  });

  it('scans for a format this package has never heard of', async () => {
    const v = await withFile('const k = "ACME-0123456789abcdef0123";', {
      patterns: { extra: [{ id: 'acme-key', label: 'ACME internal key', re: /\bACME-[0-9a-f]{20}\b/ }] },
    });

    expect(v.findings.some((f) => f.message.includes('ACME internal key'))).toBe(true);
  });

  it('replacing the library with nothing scans for nothing, and does not pretend otherwise', async () => {
    const v = await withFile(LINE, { patterns: { replace: [] } });

    expect(v.ok).toBe(true);
    expect(v.findings.some((f) => f.message.includes('REPLACED by 0'))).toBe(true);
  });

  it('still says the library was replaced when it also examined nothing', async () => {
    // The deviation leads either way: a scanner that stopped looking for something must
    // not read like one that looked and found nothing.
    const v = await run({ 'logo.png': '' }, { patterns: { replace: [] } });

    expect(v.ok).toBe(false);
    expect(v.findings[0].message).toContain('REPLACED by 0');
  });

  it('finds EVERY match of a `/g` pattern a house adds, not every second one', async () => {
    // `.test` on a global regex resumes from `lastIndex`, carried from one line into the
    // next: three keys in a file were reported as two, and the missed one was real.
    const re = /\bACME-[0-9a-f]{20}\b/g;
    const key = 'ACME-0123456789abcdef0123';
    const v = await withFile(`a = "${key}"\nb = "${key}"\nc = "${key}"`, {
      patterns: { extra: [{ id: 'acme-key', label: 'ACME internal key', re }] },
    });

    expect(v.findings.filter((f) => f.message.includes('[acme-key]')).map((f) => f.line)).toEqual([1, 2, 3]);
  });

  it('applies a `/g` placeholder vocabulary to every line, not every second one', async () => {
    const lines = [1, 2, 3].map((n) => `KEY_${n} = "${AWS}" // ZAMENI_MENYA`).join('\n');

    expect((await withFile(lines, { placeholderMarkers: /ZAMENI_MENYA/g })).ok).toBe(true);
  });

  it('takes a placeholder vocabulary that is not English', async () => {
    const line = `const AWS_KEY = "${AWS}"; // ZAMENI_MENYA`;

    expect((await withFile(line)).ok).toBe(false);
    expect((await withFile(line, { placeholderMarkers: /ZAMENI_MENYA/ })).ok).toBe(true);
  });
});
