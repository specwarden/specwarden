import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from 'specwarden';
import { InMemoryFileSource } from 'specwarden';
import { secretScan } from './secret-scan.check';

const ID = { id: 'secret-scan', title: 'no secrets', tier: 'fast' as const };

// Fixtures are built by CONCATENATION so this spec file's own source never contains
// a literal credential-shaped string — otherwise the repository's secret scan would
// flag the test that tests it. Each value only takes its dangerous shape at runtime.
const AWS = 'AK' + 'IA' + 'ABCDEFGH12345678';
const TELEGRAM = '12345678' + ':A' + 'A' + 'z'.repeat(35);
const PRIVATE_KEY = '-----BEGIN ' + 'PRIVATE KEY-----';

function run(files: Record<string, string>, opts: Partial<Parameters<typeof secretScan>[0]> = {}): IVerdict {
  const source = new InMemoryFileSource(files);
  const tracked = Object.keys(files);
  const check = secretScan({ ...ID, ...opts });
  const ctx = { changed: [], files: source, vcs: { trackedFiles: () => tracked } } as unknown as ICheckContext;
  return check.run(ctx) as IVerdict;
}

describe('secretScan', () => {
  it('is a product-zone check', () => {
    expect(secretScan({ ...ID }).zone).toBe('product');
  });

  it('catches an AWS key id, a Telegram token and a private-key block', () => {
    expect(run({ 'a.ts': `const k = "${AWS}"` }).ok).toBe(false);
    expect(run({ 'b.env': `TOKEN=${TELEGRAM}` }).ok).toBe(false);
    expect(run({ 'c.pem': `${PRIVATE_KEY}\n` }).ok).toBe(false);
  });

  it('catches a bare secret env key (no prefix), not only a prefixed one', () => {
    // 32 hex chars, concatenated so this file carries no literal secret shape.
    const HEX = '0123456789abcdef'.repeat(2);
    // The env-assignment pattern is the only one that can match these — the value is
    // plain hex, not a Telegram/AWS/key shape.
    expect(run({ 'a.env': `PASSWORD=${HEX}` }).ok).toBe(false);
    expect(run({ 'b.env': `SECRET=${HEX}` }).ok).toBe(false);
    expect(run({ 'c.env': `DB_PASSWORD=${HEX}` }).ok).toBe(false);
    // A readable value under a secret key stays allowed — the shape, not the key, gates.
    expect(run({ 'd.env': 'PASSWORD=hunter2' }).ok).toBe(true);
  });

  it('lets an ordinary file through', () => {
    expect(run({ 'a.ts': 'export const GAP_STORAGE_KEY = "gap-invite-context";\n' }).ok).toBe(true);
  });

  it('suppresses a placeholder-marked match', () => {
    expect(run({ 'a.env': `KEY=${AWS} # EXAMPLE only` }).ok).toBe(true);
    expect(run({ 'b.env': `KEY=\${SOME_VAR}${AWS}` }).ok).toBe(true);
  });

  it('honours an exact-file allowlist entry', () => {
    const files = { 'fixtures/known.txt': `k=${AWS}` };
    expect(run(files, { allowlist: [{ file: 'fixtures/known.txt', patternId: '*' }] }).ok).toBe(true);
    // …but only for the named file, never a lookalike elsewhere.
    expect(run({ 'other.txt': `k=${AWS}` }, { allowlist: [{ file: 'fixtures/known.txt', patternId: '*' }] }).ok).toBe(
      false,
    );
  });

  it('skips lockfiles, skipped extensions and binary content', () => {
    expect(run({ 'pnpm-lock.yaml': `k=${AWS}` }).ok).toBe(true);
    expect(run({ 'logo.png': `k=${AWS}` }).ok).toBe(true);
    expect(run({ 'blob.txt': `\0binary ${AWS}` }).ok).toBe(true);
  });

  it('skips a file larger than maxBytes', () => {
    const big = `padding `.repeat(50) + `k=${AWS}`;
    expect(run({ 'a.txt': big }).ok).toBe(false); // caught under the 1 MiB default
    expect(run({ 'a.txt': big }, { maxBytes: 32 }).ok).toBe(true); // over the cap → not scanned
  });

  it('an allowlist entry for one pattern id does not excuse a different pattern', () => {
    // The file is allowlisted for aws-access-key-id only; a Telegram token in it must
    // still be flagged.
    const files = { 'k.env': `AWS=${AWS}\nTG=${TELEGRAM}` };
    const allowlist = [{ file: 'k.env', patternId: 'aws-access-key-id' }];
    expect(run(files, { allowlist }).ok).toBe(false); // the telegram token is not excused
    // …and with the telegram token gone, the aws allowlist entry passes.
    expect(run({ 'k.env': `AWS=${AWS}` }, { allowlist }).ok).toBe(true);
  });
});

describe('the credential library is a preset, not a mandate', () => {
  const withFile = (body: string) =>
    ({
      files: new InMemoryFileSource({ 'app.ts': body }),
      vcs: { trackedFiles: () => ['app.ts'] },
    }) as unknown as ICheckContext;

  const AWS = 'const k = "AKIAIOSFODNN7EXAMPLX";';

  it('scans for the built-ins when the caller says nothing', () => {
    const v = secretScan({ ...ID }).run(withFile(AWS)) as IVerdict;
    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('aws-access-key-id'))).toBe(true);
  });

  it('lets a repository switch off a vendor it does not use — with a reason, said out loud', () => {
    const v = secretScan({
      ...ID,
      patterns: { disable: [{ id: 'aws-access-key-id', why: 'no AWS account anywhere in this org' }] },
    }).run(withFile(AWS)) as IVerdict;
    expect(v.ok).toBe(true);
    expect(v.findings.some((f) => f.severity === 'info' && f.message.includes('no AWS account'))).toBe(true);
  });

  it('scans for a format this package has never heard of', () => {
    const v = secretScan({
      ...ID,
      patterns: { extra: [{ id: 'acme-key', label: 'ACME internal key', re: /\bACME-[0-9a-f]{20}\b/ }] },
    }).run(withFile('const k = "ACME-0123456789abcdef0123";')) as IVerdict;
    expect(v.findings.some((f) => f.message.includes('ACME internal key'))).toBe(true);
  });

  it('replacing the library with nothing scans for nothing, and does not pretend otherwise', () => {
    const v = secretScan({ ...ID, patterns: { replace: [] } }).run(withFile(AWS)) as IVerdict;
    expect(v.ok).toBe(true);
    expect(v.findings.some((f) => f.message.includes('REPLACED by 0'))).toBe(true);
  });

  it('takes a placeholder vocabulary that is not English', () => {
    const line = 'const AWS_KEY = "AKIAIOSFODNN7EXAMPLX"; // ZAMENI_MENYA';
    expect((secretScan({ ...ID }).run(withFile(line)) as IVerdict).ok).toBe(false);
    const v = secretScan({ ...ID, placeholderMarkers: /ZAMENI_MENYA/ }).run(withFile(line)) as IVerdict;
    expect(v.ok).toBe(true);
  });
});
