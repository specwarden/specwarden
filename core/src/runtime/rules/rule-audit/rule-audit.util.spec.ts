import { describe, expect, it } from 'vitest';

import { type IRule, computeCoverage } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { orphanChecks, ruleOwnerFindings } from './rule-audit.util';

const rule = (id: string, enforcement: IRule['enforcement']): IRule => ({
  id,
  statement: id,
  owner: 'AGENTS.md',
  enforcement,
});

describe('computeCoverage', () => {
  it('counts enforced, not-mechanizable, and unenforced-without-reason', () => {
    const cov = computeCoverage([
      rule('a', { enforcedBy: ['x'] }),
      rule('b', { notMechanizable: 'a real reason' }),
      rule('c', { enforcedBy: [] }), // declared enforced but names nothing → debt
    ]);
    expect(cov).toMatchObject({ total: 3, enforced: 1, notMechanizable: 1, unenforcedWithoutReason: 1 });
  });
});

describe('orphanChecks', () => {
  it('finds checks that no rule enforces (an enforcer with no rule is a defect)', () => {
    const rules = [rule('r', { enforcedBy: ['used'] })];
    expect(orphanChecks(['used', 'orphan'], rules)).toEqual(['orphan']);
  });
});

describe('ruleOwnerFindings', () => {
  it('flags a rule whose owner document is gone', () => {
    const files = new InMemoryFileSource({ 'AGENTS.md': '# router' });
    const rules = [
      rule('ok', { enforcedBy: ['x'] }), // owner AGENTS.md exists
      { id: 'gone', statement: 's', owner: 'docs/missing.md', enforcement: { enforcedBy: ['y'] } },
    ];
    const findings = ruleOwnerFindings(rules, files);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('docs/missing.md');
  });

  it('accepts an owner path with a section suffix', () => {
    const files = new InMemoryFileSource({ 'AGENTS.md': '# router' });
    const findings = ruleOwnerFindings(
      [{ id: 'r', statement: 's', owner: 'AGENTS.md § Releases', enforcement: { enforcedBy: ['x'] } }],
      files,
    );
    expect(findings).toEqual([]);
  });
});

describe('orphanChecks — what counts as enforcing', () => {
  it('counts only a rule that names checks; a not-mechanizable rule enforces nothing', () => {
    const rules = [rule('judged', { notMechanizable: 'a human reads it' })];

    expect(orphanChecks(['a'], rules)).toEqual(['a']);
  });

  it('is empty for an empty roster, and every check is an orphan with no rules', () => {
    expect(orphanChecks([], [rule('r', { enforcedBy: ['x'] })])).toEqual([]);
    expect(orphanChecks(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('ruleOwnerFindings — what counts as a document', () => {
  /**
   * An owner may be a PERSON or a team. Checking `@platform` for existence on disk
   * would fail every rule a person owns — a false positive a repository fixes by
   * deleting the owner, which is the one field that makes a rule arguable.
   */
  it('does not look for a file when the owner is not path-shaped', () => {
    const files = new InMemoryFileSource({});
    const findings = ruleOwnerFindings(
      [{ id: 'p', statement: 's', owner: '@platform', enforcement: { enforcedBy: ['x'] } }],
      files,
    );

    expect(findings).toEqual([]);
  });

  // A module's check implies its rule, owned by the package that ships the reasoning.
  it('does not look for a file when the owner is a scoped package the repository depends on', () => {
    const owners = [
      '@specwarden/docs',
      '@specwarden/plugin-nestjs § Layering',
      '@scope/pkg/GUIDE.md',
      '@acme/policies',
      '@docs/rules.md',
    ];
    const manifest = JSON.stringify({ devDependencies: { '@specwarden/docs': '1', '@specwarden/plugin-nestjs': '1' } });
    const findings = ruleOwnerFindings(
      owners.map((owner, i) => ({ id: `r${i}`, statement: 's', owner, enforcement: { enforcedBy: ['x'] } })),
      new InMemoryFileSource({ 'package.json': manifest }),
    );

    // A scoped name nobody installed is still read as a path — it was, before, and any
    // `@x/y` passing would let a typo'd owner through.
    expect(findings.map((f) => f.message)).toEqual([
      "rule 'r2' names owner '@scope/pkg/GUIDE.md', whose document @scope/pkg/GUIDE.md does not exist",
      "rule 'r3' names owner '@acme/policies', whose document @acme/policies does not exist",
      "rule 'r4' names owner '@docs/rules.md', whose document @docs/rules.md does not exist",
    ]);
  });

  it('checks an owner that is path-shaped by a slash alone, and names it', () => {
    const findings = ruleOwnerFindings(
      [{ id: 'r', statement: 's', owner: 'skills/gates/SKILL', enforcement: { enforcedBy: ['x'] } }],
      new InMemoryFileSource({}),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'error', ruleId: 'rule-owner-resolves' });
    expect(findings[0].message).toBe(
      "rule 'r' names owner 'skills/gates/SKILL', whose document skills/gates/SKILL does not exist",
    );
  });

  it('attributes findings to the rule id it is given', () => {
    const findings = ruleOwnerFindings(
      [{ id: 'r', statement: 's', owner: 'gone.md', enforcement: { enforcedBy: ['x'] } }],
      new InMemoryFileSource({}),
      'owners',
    );

    expect(findings[0].ruleId).toBe('owners');
  });
});

describe('ruleOwnerFindings — a rule with no owner', () => {
  it('reports it by name, instead of crashing the audit on "reading \'split\'"', () => {
    const ownerless = { id: 'x', statement: 's', enforcement: { enforcedBy: ['x'] } } as unknown as IRule;
    expect(ruleOwnerFindings([ownerless], new InMemoryFileSource({})).map((f) => f.message)).toEqual([
      "rule 'x' names no owner — say which document holds its reasoning (`owner: 'docs/RULES.md'`).",
    ]);
  });
});
