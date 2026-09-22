import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';

import { openspec } from './openspec.source';

describe('openspec spec source', () => {
  it('reads change tasks.md checkboxes, with done state', () => {
    const files = new InMemoryFileSource({
      'openspec/changes/add-x/tasks.md': '- [ ] do the thing\n- [x] done thing\nnot a task\n',
    });
    const result = openspec().tasks(files);
    expect(result.found).toBe(true);
    expect(result.items).toEqual([
      { id: 'add-x#1', title: 'do the thing', done: false },
      { id: 'add-x#2', title: 'done thing', done: true },
    ]);
  });

  it('says found:false when OpenSpec is not installed here', () => {
    const result = openspec().tasks(new InMemoryFileSource({}));
    expect(result.found).toBe(false);
    expect(result.note).toContain('not found');
  });
});

describe('requirements', () => {
  const corpus = {
    'openspec/specs/billing/spec.md':
      '## Purpose\n\n### Requirement: The system SHALL invoice monthly\n\n#### Scenario: first month\n\n### Requirement: A refund SHALL be reversible\n',
    'openspec/specs/auth/spec.md': '### Requirement: A session SHALL expire\n',
  };

  it('reads every requirement heading under specs/, keyed by capability', () => {
    const result = openspec().requirements(new InMemoryFileSource(corpus));
    expect(result.found).toBe(true);
    expect(result.items).toEqual([
      { id: 'auth#a-session-shall-expire', statement: 'A session SHALL expire' },
      { id: 'billing#the-system-shall-invoice-monthly', statement: 'The system SHALL invoice monthly' },
      { id: 'billing#a-refund-shall-be-reversible', statement: 'A refund SHALL be reversible' },
    ]);
  });

  it('gives the same id for the same wording, so a re-read reconciles rather than duplicates', () => {
    const first = openspec().requirements(new InMemoryFileSource(corpus));
    const again = openspec().requirements(new InMemoryFileSource(corpus));
    expect(first.items.map((i) => i.id)).toEqual(again.items.map((i) => i.id));
  });

  it('prefixes by capability, so two capabilities wording one requirement the same do not merge', () => {
    const result = openspec().requirements(
      new InMemoryFileSource({
        'openspec/specs/a/spec.md': '### Requirement: It SHALL be logged\n',
        'openspec/specs/b/spec.md': '### Requirement: It SHALL be logged\n',
      }),
    );
    expect(new Set(result.items.map((i) => i.id)).size).toBe(2);
  });

  it('reports an empty corpus AS empty — the defect this exists for', () => {
    // It used to answer `{found: true, items: []}` for any specs/ directory, so
    // sync-invariants printed "0 requirements" and then "in sync": a reconciliation
    // that could not fail. The note is what makes the silence audible.
    const result = openspec().requirements(new InMemoryFileSource({ 'openspec/specs/x/spec.md': '# nothing here\n' }));
    expect(result.found).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.note).toContain('no requirement heading');
  });

  it('says found:false when there is no specs directory at all', () => {
    const result = openspec().requirements(new InMemoryFileSource({}));
    expect(result.found).toBe(false);
    expect(result.note).toContain('not found');
  });

  it('takes a different heading grammar rather than memorising one', () => {
    const result = openspec({ requirementHeading: /^##\s+REQ\s+—\s*(.+?)\s*$/ }).requirements(
      new InMemoryFileSource({ 'openspec/specs/x/spec.md': '## REQ — the fork words it this way\n' }),
    );
    expect(result.items).toEqual([{ id: 'x#the-fork-words-it-this-way', statement: 'the fork words it this way' }]);
  });

  it('reads a relocated root, so a layout change is a config edit rather than a silence', () => {
    const result = openspec({ root: 'spec-tree' }).requirements(
      new InMemoryFileSource({ 'spec-tree/specs/x/spec.md': '### Requirement: moved\n' }),
    );
    expect(result.items).toEqual([{ id: 'x#moved', statement: 'moved' }]);
  });
});
