import { describe, expect, it } from 'vitest';

import { speckit } from '@specwarden/speckit';
import { CheckOptionsError, planInvariantSync, testContext, uncoveredFactories } from 'specwarden';

/**
 * Everything this package publishes, wired the way a consumer wires it.
 *
 * Like the OpenSpec playground, and deliberately the SAME shape: the two sources
 * implement one port, and a playground that examined each of them on its own terms would
 * stop being able to say whether the port is really being honoured. Where this one
 * differs from its sibling is where Spec Kit differs from OpenSpec — ids come from the
 * document rather than from the wording, and both requirements and tasks live inside one
 * feature folder.
 */

const filesOf = (tree: Record<string, string>) => testContext({ tree }).files;

/** A repository with Spec Kit initialised and two features described. */
const INSTALLED: Record<string, string> = {
  'specs/001-invites/spec.md': [
    '# invites',
    '',
    '- **FR-001**: the system MUST key an invite by the gap it belongs to',
    '- **FR-002**: the system MUST refuse a second claim on one slot',
  ].join('\n'),
  'specs/001-invites/tasks.md': ['- [x] add the map', '- [ ] wire the refetch'].join('\n'),
  'specs/002-results/spec.md': '- **FR-001**: the system MUST tick money, never accept it typed\n',
};

/** The same repository before Spec Kit was ever run. */
const ABSENT: Record<string, string> = { 'README.md': '# a repository with no specs tree\n' };

describe('@specwarden/speckit', () => {
  it('publishes a source and no check factory — a check added here must join a playground that runs it', async () => {
    const mod = (await import('@specwarden/speckit')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: [], probe: { featuresDir: 'specs' } })).toEqual([]);
  });

  it('reads requirements out of every feature folder', () => {
    const result = speckit().requirements(filesOf(INSTALLED));

    expect(result.found).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.statement).toContain('key an invite');
  });

  it('keeps two features that both number from FR-001 apart', () => {
    // Without the feature prefix these two collapse into one id, and the second
    // requirement silently stops existing — with every count still looking right.
    const ids = speckit()
      .requirements(filesOf(INSTALLED))
      .items.map((r) => r.id);

    expect(ids).toContain('001-invites#FR-001');
    expect(ids).toContain('002-results#FR-001');
  });

  it('reads tasks, and which of them are done', () => {
    const result = speckit().tasks(filesOf(INSTALLED));

    expect(result.items.map((t) => t.done)).toEqual([true, false]);
  });

  it('says it did NOT find the tree, rather than reporting nothing to do', () => {
    const requirements = speckit().requirements(filesOf(ABSENT));

    expect(requirements.found).toBe(false);
    expect(requirements.note).toContain('specs/');
    expect(speckit().tasks(filesOf(ABSENT)).found).toBe(false);
  });

  it('a repository that moved its features says where, instead of going silent', () => {
    const moved = { 'docs/specs/001-invites/spec.md': '- **FR-001**: the system MUST do the thing\n' };

    expect(speckit().requirements(filesOf(moved)).found).toBe(false);
    expect(speckit({ featuresDir: 'docs/specs' }).requirements(filesOf(moved)).items).toHaveLength(1);
  });

  it('feeds the reconciliation a consumer runs, and pairs an invariant that pins one', () => {
    const result = speckit().requirements(filesOf(INSTALLED));

    const plan = planInvariantSync(result.items, [{ id: '001-invites#FR-001', location: 'src/INVITES_MODULE.md:12' }]);

    expect(plan.inSync).toEqual(['001-invites#FR-001']);
    expect(plan.toDeposit).toHaveLength(2);
  });

  it('found but empty is reported WITH a note — a format that drifted reads as "nothing to do"', () => {
    const drifted = { 'specs/001-invites/spec.md': '1. The system must key an invite by its gap.\n' };
    const result = speckit().requirements(filesOf(drifted));

    expect(result.found).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.note).toContain('holds no requirement line');
  });

  it('a house that numbers its requirements differently says so, instead of going silent', () => {
    const house = { 'specs/001-invites/spec.md': '| req-7 | the system MUST key an invite by its gap |\n' };

    expect(speckit().requirements(filesOf(house)).items).toEqual([]);
    expect(
      speckit({ requirementPattern: /^\|\s*req-(\d+)\s*\|\s*(.+?)\s*\|$/ }).requirements(filesOf(house)).items,
    ).toEqual([{ id: '001-invites#7', statement: 'the system MUST key an invite by its gap' }]);
  });

  it('reads renamed files, once the consumer says what they are called', () => {
    const renamed = {
      'specs/001-invites/requirements.md': '- **FR-001**: the system MUST do the thing\n',
      'specs/001-invites/todo.md': '- [ ] do it\n',
    };
    const source = speckit({ specFile: 'requirements.md', tasksFile: 'todo.md' });

    expect(source.requirements(filesOf(renamed)).items).toHaveLength(1);
    expect(source.tasks(filesOf(renamed)).items).toHaveLength(1);
  });

  it('refuses an option it does not have, a check’s identity, an empty path and a string pattern — by name', () => {
    expect(() => speckit({ root: 'specs' } as never)).toThrow(CheckOptionsError);
    expect(() => speckit({ root: 'specs' } as never)).toThrow('`root` is not an option of speckit');
    expect(() => speckit({ rule: 'x' } as never)).toThrow('`rule` is not an option of speckit');
    expect(() => speckit({ tasksFile: '' })).toThrow('`tasksFile` is empty');
    expect(() => speckit({ requirementPattern: 'FR-' } as never)).toThrow('`requirementPattern` must be a RegExp');
  });
});
