import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheck, type IRule } from '../../../domain';
import { NodeFileSource } from '../../../infrastructure';
import { loadConsumerTree } from './load-consumer-tree.util';

const CHECK_FILE = (id: string) =>
  `export const check = { id: '${id}', title: '${id}', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: ${CHECK_CONTRACT_VERSION}, when: () => true, run: () => ({ ok: true, findings: [] }) };\n`;

const inline = (id: string): ICheck => ({
  id,
  title: id,
  tier: 'fast',
  zone: 'consumer',
  capabilities: [],
  contractVersion: CHECK_CONTRACT_VERSION,
  when: () => true,
  run: () => ({ ok: true, findings: [] }),
});

const RULES: readonly IRule[] = [{ id: 'r', statement: 's', owner: 'README.md', enforcement: { checkIds: ['from-file'] } }];

describe('loadConsumerTree', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-tree-'));
    mkdirSync(join(root, '.specwarden', 'checks', 'docs'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const files = () => new NodeFileSource(root);
  const write = (rel: string, body: string) => writeFileSync(join(root, '.specwarden', rel), body);

  it('assembles discovered, declared, plugin and harness checks in that order', async () => {
    write('checks/docs/a.check.mjs', CHECK_FILE('from-file'));
    const tree = await loadConsumerTree(files(), '.specwarden', {
      rules: RULES,
      checks: [inline('declared')],
      plugins: [{ name: 'p', checks: [inline('from-plugin')] }],
    });
    const ids = tree.checks.map((c) => c.id);
    expect(ids.slice(0, 3)).toEqual(['from-file', 'declared', 'from-plugin']);
    expect(ids).toEqual(expect.arrayContaining(['rule-owner-resolves', 'orphan-check', 'ratchet-direction']));
  });

  it('a config with nothing but rules still yields a working roster', async () => {
    // The point of convention: the short config is the normal config.
    const tree = await loadConsumerTree(files(), '.specwarden', { rules: RULES });
    expect(tree.checks.length).toBeGreaterThanOrEqual(5);
    // The declared rules, plus the one the harness brings for its own checks — without
    // it the self-checks are orphans on the first run, and a harness reporting its own
    // machinery as a defect is the worst possible first impression.
    expect(tree.rules).toEqual([...RULES, expect.objectContaining({ id: 'harness-integrity' })]);
  });

  it('the harness rule names every self-check, so none of them is an orphan', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', { rules: RULES });
    const harnessRule = tree.rules.find((r) => r.id === 'harness-integrity');
    const enforcement = harnessRule?.enforcement as { checkIds: readonly string[] };
    const selfChecks = ['rule-owner-resolves', 'rule-coverage', 'orphan-check', 'enforcement-resolves', 'ratchet-direction'];
    expect([...enforcement.checkIds].sort()).toEqual([...selfChecks].sort());
    expect(harnessRule?.owner).toBe('.specwarden/README.md');
  });

  it('no harness rule when the consumer declared no registry — the audits are off anyway', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', {});
    expect(tree.rules).toEqual([]);
  });

  it('the self-checks see the whole roster, themselves included', async () => {
    write('checks/docs/a.check.mjs', CHECK_FILE('from-file'));
    const tree = await loadConsumerTree(files(), '.specwarden', { rules: RULES });
    const orphan = tree.checks.find((c) => c.id === 'orphan-check');
    expect(orphan).toBeDefined();
    // enforcement-resolves resolves 'from-file' against the roster; a roster read too
    // early would not contain it. Run it and expect no error finding.
    const enf = tree.checks.find((c) => c.id === 'enforcement-resolves');
    const verdict = await enf?.run({ files: files(), changed: [] } as never);
    expect(verdict?.ok).toBe(true);
  });

  it('autoload: false reads no files', async () => {
    write('checks/docs/a.check.mjs', CHECK_FILE('from-file'));
    const tree = await loadConsumerTree(files(), '.specwarden', { rules: [], autoload: false });
    expect(tree.checks.map((c) => c.id)).not.toContain('from-file');
  });

  it('checksDir relocates the sweep', async () => {
    mkdirSync(join(root, '.specwarden', 'gates'), { recursive: true });
    write('gates/g.check.mjs', CHECK_FILE('from-gates'));
    write('checks/docs/a.check.mjs', CHECK_FILE('from-checks'));
    const tree = await loadConsumerTree(files(), '.specwarden', { rules: [], checksDir: 'gates' });
    const ids = tree.checks.map((c) => c.id);
    expect(ids).toContain('from-gates');
    expect(ids).not.toContain('from-checks');
  });

  it('harness: false removes the self-checks and says so', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', { rules: [], harness: false });
    expect(tree.checks.map((c) => c.id)).not.toContain('orphan-check');
    expect(tree.notes.some((n) => n.includes('disabled entirely'))).toBe(true);
  });

  it('reports what it swept', async () => {
    write('checks/docs/a.check.mjs', CHECK_FILE('x'));
    const tree = await loadConsumerTree(files(), '.specwarden', { rules: [] });
    expect(tree.notes.some((n) => /discovered 1 check\(s\) in 1 file\(s\)/.test(n))).toBe(true);
  });
});

describe('a self-check declared by hand is refused with the fix, not a bare duplicate', () => {
  it('names the check and both ways out', async () => {
    const root2 = mkdtempSync(join(tmpdir(), 'spw-tree2-'));
    mkdirSync(join(root2, '.specwarden', 'checks'), { recursive: true });
    try {
      const run = loadConsumerTree(new NodeFileSource(root2), '.specwarden', { rules: [], checks: [inline('orphan-check')] });
      await expect(run).rejects.toThrow(/orphan-check: the engine now builds this check from convention/);
      await expect(run).rejects.toThrow(/harness: \{ disable:/);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });
});

/**
 * A rule and the check that enforces it are one fact. Kept in two lists joined by a
 * string id, they are one fact maintained twice — the shape the gate list was already
 * moved off, while the rule register stayed behind and grew to 99 entries, 68 of them
 * naming exactly one check.
 */
describe('loadConsumerTree — rules declared on the checks that enforce them', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-tree-rules-'));
    mkdirSync(join(root, '.specwarden', 'checks'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const files = () => new NodeFileSource(root);
  const ruled = (id: string, rule: Record<string, unknown>): ICheck => ({ ...inline(id), rule } as ICheck);

  it('joins the register, enforced by the check that declared it', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', {
      rules: [],
      checks: [ruled('a', { statement: 'a holds', owner: 'README.md' })],
    });

    expect(tree.rules).toContainEqual(
      expect.objectContaining({ id: 'a', statement: 'a holds', owner: 'README.md', enforcement: { checkIds: ['a'] } }),
    );
  });

  it('defaults the rule id to the check id, and takes an explicit one', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', {
      rules: [],
      checks: [ruled('a', { id: 'no-drift', statement: 's', owner: 'README.md' })],
    });

    expect(tree.rules.find((r) => r.id === 'no-drift')?.enforcement).toEqual({ checkIds: ['a'] });
  });

  it('merges several checks enforcing ONE rule, which is the many-to-one the register always allowed', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', {
      rules: [],
      checks: [
        ruled('a', { id: 'shared', statement: 's', owner: 'README.md' }),
        ruled('b', { id: 'shared', statement: 's', owner: 'README.md' }),
      ],
    });

    expect(tree.rules.find((r) => r.id === 'shared')?.enforcement).toEqual({ checkIds: ['a', 'b'] });
  });

  it('carries the zone and the irreversible mark', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', {
      rules: [],
      checks: [ruled('a', { statement: 's', owner: 'README.md', irreversible: true })],
    });

    expect(tree.rules.find((r) => r.id === 'a')).toMatchObject({ zone: 'consumer', irreversible: true });
  });

  it('adds nothing when no check declares a rule', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', { rules: [], checks: [inline('a')] });

    expect(tree.rules.filter((r) => r.id === 'a')).toEqual([]);
  });

  it('stays out of the register entirely when the consumer declared none', async () => {
    // With no `rules` key the audits are off; adding entries then would be a register
    // nobody asked for, audited by nothing.
    const tree = await loadConsumerTree(files(), '.specwarden', {
      checks: [ruled('a', { statement: 's', owner: 'README.md' })],
    });

    expect(tree.rules).toEqual([]);
  });
});

describe('loadConsumerTree — one id, one declaration', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spw-tree-dupe-'));
    mkdirSync(join(root, '.specwarden', 'checks'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const files = () => new NodeFileSource(root);
  const ruled = (id: string, rule: Record<string, unknown>): ICheck => ({ ...inline(id), rule } as ICheck);

  it('refuses a rule declared both on a check and in the register', async () => {
    // It happened on the first migration that used this: the rule moved onto its check
    // and stayed in the register, and every audit still passed over two copies that
    // could disagree about wording, owner and whether the rule is irreversible.
    await expect(
      loadConsumerTree(files(), '.specwarden', {
        rules: [{ id: 'a', statement: 's', owner: 'README.md', enforcement: { checkIds: ['a'] } }],
        checks: [ruled('a', { statement: 's', owner: 'README.md' })],
      }),
    ).rejects.toThrow(/declared BOTH on a check/);
  });

  it('says what to do about it rather than only that it happened', async () => {
    await expect(
      loadConsumerTree(files(), '.specwarden', {
        rules: [{ id: 'a', statement: 's', owner: 'README.md', enforcement: { checkIds: ['a'] } }],
        checks: [ruled('a', { statement: 's', owner: 'README.md' })],
      }),
    ).rejects.toThrow(/delete the register entry, or drop the `rule` from the check/);
  });

  it('allows the same id on two CHECKS — that is the many-to-one the register always had', async () => {
    const tree = await loadConsumerTree(files(), '.specwarden', {
      rules: [],
      checks: [ruled('a', { id: 'shared', statement: 's', owner: 'README.md' }), ruled('b', { id: 'shared', statement: 's', owner: 'README.md' })],
    });

    expect(tree.rules.find((r) => r.id === 'shared')?.enforcement).toEqual({ checkIds: ['a', 'b'] });
  });
});
