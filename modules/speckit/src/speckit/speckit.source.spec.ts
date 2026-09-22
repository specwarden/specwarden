import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';
import { speckit } from './speckit.source';

const TREE = {
  'specs/001-checkout/spec.md': [
    '# Checkout',
    '',
    '## Requirements',
    '- **FR-001**: the system MUST refuse an empty basket',
    '- **FR-002**: the system MUST show tax before payment',
    '',
    'Some prose that is not a requirement.',
  ].join('\n'),
  'specs/001-checkout/tasks.md': ['- [x] wire the basket', '- [ ] add the tax line'].join('\n'),
  'specs/002-search/spec.md': '- **FR-001**: search MUST be case-insensitive',
  'specs/002-search/tasks.md': '- [ ] index the catalogue',
};

describe('speckit reads a Spec Kit tree', () => {
  const source = speckit();
  const files = new InMemoryFileSource(TREE);

  it('collects requirements from every feature', () => {
    const r = source.requirements(files);
    expect(r.found).toBe(true);
    expect(r.items.map((i) => i.id)).toEqual(['001-checkout#FR-001', '001-checkout#FR-002', '002-search#FR-001']);
  });

  it('namespaces the id by feature, because two features both number from FR-001', () => {
    // Without the prefix these two collide and one requirement silently replaces the
    // other — the kind of loss that leaves no error anywhere.
    const ids = source.requirements(files).items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries the statement through untranslated', () => {
    expect(source.requirements(files).items[0].statement).toBe('the system MUST refuse an empty basket');
  });

  it('reads task state', () => {
    const t = source.tasks(files);
    expect(t.items).toEqual([
      { id: '001-checkout#1', title: 'wire the basket', done: true },
      { id: '001-checkout#2', title: 'add the tax line', done: false },
      { id: '002-search#1', title: 'index the catalogue', done: false },
    ]);
  });
});

describe('it says when Spec Kit is not there', () => {
  it('reports found:false rather than an empty list', () => {
    // The distinction the whole port exists for: an empty list reads as "no tasks",
    // and a source that answers "no tasks" when it found no TOOL is a check that
    // cannot fail.
    const r = speckit().tasks(new InMemoryFileSource({ 'README.md': '# x' }));
    expect(r.found).toBe(false);
    expect(r.items).toEqual([]);
    expect(r.note).toContain('is Spec Kit initialised here?');
  });

  it('says the same for requirements', () => {
    expect(speckit().requirements(new InMemoryFileSource({})).found).toBe(false);
  });

  it('a present tree with no matching files is found, and empty — a different answer', () => {
    const r = speckit().tasks(new InMemoryFileSource({ 'specs/001-x/notes.md': 'nothing here' }));
    expect(r.found).toBe(true);
    expect(r.items).toEqual([]);
  });
});

describe('every path is an option, because layouts move', () => {
  it('reads a relocated root and renamed files', () => {
    const files = new InMemoryFileSource({
      '.specify/features/alpha/requirements.md': '- **NFR-9**: it MUST be fast',
      '.specify/features/alpha/todo.md': '- [ ] measure it',
    });
    const source = speckit({ root: '.specify/features', specFile: 'requirements.md', tasksFile: 'todo.md' });
    expect(source.requirements(files).items[0]).toEqual({ id: 'alpha#NFR-9', statement: 'it MUST be fast' });
    expect(source.tasks(files).items[0].title).toBe('measure it');
  });
});
