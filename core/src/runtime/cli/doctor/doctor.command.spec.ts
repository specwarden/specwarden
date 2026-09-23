import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheck, type IRule, type ISpecSource } from '../../../domain';
import { CheckRegistry } from '../../container';
import type { IWardenConfig } from '../../config/config.model';
import { doctor } from './doctor.command';

const aCheck = (id: string, over: Partial<ICheck> = {}): ICheck => ({
  id,
  title: `${id} title`,
  tier: 'fast',
  zone: 'consumer',
  capabilities: [],
  contractVersion: CHECK_CONTRACT_VERSION,
  when: () => true,
  run: () => {
    throw new Error('doctor must never run a check');
  },
  ...over,
});

function run(config: IWardenConfig, checks: readonly ICheck[] = []) {
  const registry = new CheckRegistry();
  registry.registerAll(checks);
  let out = '';
  let err = '';
  const code = doctor(config, registry, { out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

const rule = (id: string, enforcement: IRule['enforcement']): IRule => ({
  id,
  statement: id,
  owner: 'README.md',
  enforcement,
});

/**
 * `doctor` answers "is the harness itself wired", which a green gate cannot. Every
 * line is read from declarations and nothing is run — the checks above throw if they
 * are, so a doctor that started executing the roster would fail every test here.
 */
describe('the roster', () => {
  it('prints one tab-separated line per check: id, tier, zone, capabilities, title', () => {
    const r = run({}, [
      aCheck('a', { capabilities: ['read', 'exec'] }),
      aCheck('b', { tier: 'heavy', zone: 'product' }),
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('a\tfast\tconsumer\t[read,exec]\ta title\n');
    expect(r.out).toContain('b\theavy\tproduct\t[—]\tb title\n');
  });

  it('marks a check whose capability the config denies, so the refusal is seen before a run meets it', () => {
    const r = run({ denyCapabilities: ['net'] }, [
      aCheck('fetches', { capabilities: ['read', 'net'] }),
      aCheck('reads', { capabilities: ['read'] }),
    ]);
    expect(r.out).toContain('fetches\tfast\tconsumer\t[read,net] DENIED\t');
    expect(r.out).toContain('reads\tfast\tconsumer\t[read]\t');
    expect(r.out).not.toContain('[read] DENIED');
    expect(r.out).toContain('\ndenyCapabilities: net\n');
  });

  it('prints no deny line when nothing is denied', () => {
    expect(run({}, [aCheck('a')]).out).not.toContain('denyCapabilities');
  });

  // It said neither which file to open nor whether a check blocks or needs the machine alone.
  it('marks an advisory and an exclusive check, and names the file a check came from', () => {
    const found = aCheck('found', { advisory: true, exclusive: true });
    const registry = new CheckRegistry({
      originOf: (c) => (c === found ? '.specwarden/checks/x/found.check.mjs' : undefined),
    });
    registry.registerAll([found, aCheck('declared')]);
    let out = '';
    doctor({}, registry, { out: (t) => (out += t), err: () => {} });
    expect(out).toContain(
      'found\tfast\tconsumer\t[—] advisory exclusive\tfound title\t.specwarden/checks/x/found.check.mjs\n',
    );
    expect(out).toContain('declared\tfast\tconsumer\t[—]\tdeclared title\n');
  });
});

describe('ownership', () => {
  it('lists each declared role and exits 0 when every owner is a configured source', () => {
    const r = run({ ownership: { plans: 'specwarden', tasks: 'native' } });
    expect(r.code).toBe(0);
    expect(r.out).toContain('\nownership:\n  plans: specwarden\n  tasks: native\n');
    expect(r.err).toBe('');
  });

  it('exits 1 and names the role when an owner is a source nobody configured', () => {
    // A role owned by a tool that is not present is a role nobody owns — which is how
    // a second task list quietly appears. doctor is where that must be loud.
    const r = run({ ownership: { tasks: 'openspec' } });
    expect(r.code).toBe(1);
    expect(r.err).toContain("⚠ ownership conflict: role 'tasks' is owned by 'openspec'");
  });

  it('accepts the configured spec source as an owner', () => {
    const specSource = { name: 'openspec' } as ISpecSource;
    const r = run({ ownership: { tasks: 'openspec' }, specSource });
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
  });

  it('prints no ownership block when none is declared', () => {
    expect(run({}).out).not.toContain('ownership');
  });
});

describe('rule coverage', () => {
  it('counts each kind of rule, and the checks that enforce none', () => {
    const r = run(
      {
        rules: [
          rule('enforced', { checkIds: ['a'] }),
          rule('reasoned', { notMechanizable: 'branch protection, in the forge' }),
          rule('debt', { checkIds: [] }),
        ],
      },
      [aCheck('a'), aCheck('orphan')],
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain('\nrule coverage:\n');
    expect(r.out).toContain('  declared: 3\n');
    expect(r.out).toContain('  enforced: 1\n');
    expect(r.out).toContain('  not mechanizable (with reason): 1\n');
    expect(r.out).toContain('  unenforced without a reason: 1\n');
    // `orphan` enforces no rule; `a` does. A count that included `a` would report
    // the harness broken exactly where it is not.
    expect(r.out).toContain('  checks enforcing no rule (orphans): 1\n');
  });

  it('prints no coverage block for an empty or absent register — there is nothing to measure', () => {
    expect(run({ rules: [] }, [aCheck('a')]).out).not.toContain('rule coverage');
    expect(run({}, [aCheck('a')]).out).not.toContain('rule coverage');
  });

  // An empty rules.mjs printed "declared: 1, enforced: 1" — a rule nobody could find.
  it("names the engine's own rule beside the count", () => {
    const harness = rule('harness-integrity', { checkIds: ['a'] });
    expect(run({ rules: [harness] }, [aCheck('a')]).out).toContain(
      "  declared: 1 (the engine's own: harness-integrity)\n",
    );
    expect(run({ rules: [rule('mine', { checkIds: ['a'] })] }, [aCheck('a')]).out).toContain('  declared: 1\n');
  });

  it('a fully covered register does not mask an ownership conflict — the exit code is what CI reads', () => {
    const r = run({ ownership: { tasks: 'nobody' }, rules: [rule('x', { checkIds: ['a'] })] }, [aCheck('a')]);
    expect(r.code).toBe(1);
  });
});

describe('doctor --json', () => {
  // `--json` was accepted and ignored: the text was all a script had to parse.
  it('is the same report as one document, and runs nothing', () => {
    const registry = new CheckRegistry({
      originOf: (c) => (c.id === 'a' ? '.specwarden/checks/a.check.mjs' : undefined),
    });
    registry.registerAll([
      aCheck('a', {
        advisory: true,
        capabilities: ['exec'],
        rule: { statement: 's', owner: '@specwarden/docs', implied: true },
      }),
    ]);
    let out = '';
    const code = doctor(
      { denyCapabilities: ['exec'], rules: [rule('harness-integrity', { checkIds: ['a'] })] },
      registry,
      { out: (t) => (out += t), err: () => {} },
      { json: true },
    );

    expect(code).toBe(0);
    expect(JSON.parse(out)).toEqual({
      version: 1,
      checks: [
        {
          id: 'a',
          title: 'a title',
          tier: 'fast',
          zone: 'consumer',
          capabilities: ['exec'],
          denied: true,
          advisory: true,
          exclusive: false,
          origin: '.specwarden/checks/a.check.mjs',
          rule: { statement: 's', owner: '@specwarden/docs', implied: true },
        },
      ],
      denyCapabilities: ['exec'],
      rules: {
        declared: 1,
        engine: ['harness-integrity'],
        enforced: 1,
        notMechanizable: 0,
        unenforcedWithoutReason: 0,
        orphans: [],
      },
    });
  });

  it('exits 1 on an ownership conflict, as the text does, and names it in the document', () => {
    let out = '';
    const code = doctor(
      { ownership: { tasks: 'openspec' } },
      new CheckRegistry(),
      { out: (t) => (out += t), err: () => {} },
      {
        json: true,
      },
    );
    expect(code).toBe(1);
    expect((JSON.parse(out) as { ownership: { conflicts: string[] } }).ownership.conflicts[0]).toContain(
      "role 'tasks'",
    );
  });
});
