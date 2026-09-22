import { describe, expect, it } from 'vitest';

import { ownsRole, validateOwnership } from '../../domain';
import { InMemoryFileSource } from '../../infrastructure';
import { native } from './native-spec-source/native-spec-source.factory';

describe('native spec source', () => {
  it('reads plans as tasks, a phase per task, carrying its acceptance', () => {
    const files = new InMemoryFileSource({
      'docs/_plans/README.md': 'ignored',
      'docs/_plans/feature.md':
        '**Status:** active\n\n## Phase 1 — a\n**Acceptance.** cmd-a\n\n## Phase 2 — b\n**Acceptance.** cmd-b\n',
    });
    const result = native({ plansDir: 'docs/_plans' }).tasks(files);
    expect(result.found).toBe(true);
    expect(result.items).toEqual([
      { id: 'feature.md#1', title: 'a', acceptance: 'cmd-a' },
      { id: 'feature.md#2', title: 'b', acceptance: 'cmd-b' },
    ]);
  });

  it('says found:false — not an empty list — when the plans dir is absent', () => {
    const result = native({ plansDir: 'docs/_plans' }).tasks(new InMemoryFileSource({}));
    expect(result.found).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.note).toContain('docs/_plans');
  });
});

describe('ownership', () => {
  it('flags an owner naming a source that is not configured', () => {
    const findings = validateOwnership({ tasks: 'openspec', plans: 'specwarden' }, []);
    expect(findings.map((f) => f.role)).toEqual(['tasks']); // openspec not configured
  });

  it('accepts an owner that is configured', () => {
    expect(validateOwnership({ tasks: 'openspec' }, ['openspec'])).toEqual([]);
  });

  it('ownsRole stands SpecWarden down for a foreign owner', () => {
    expect(ownsRole({ tasks: 'openspec' }, 'tasks')).toBe(false);
    expect(ownsRole({ tasks: 'specwarden' }, 'tasks')).toBe(true);
    expect(ownsRole({}, 'tasks')).toBe(true); // unassigned → SpecWarden owns it
  });
});
