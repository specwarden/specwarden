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

describe('found, and empty, says so', () => {
  it('reports a tree with no requirement line WITH a note — a format that drifted reads as "nothing to do"', () => {
    const r = speckit().requirements(
      new InMemoryFileSource({ 'specs/001-x/spec.md': '# x\n\nFR-001 the system MUST…' }),
    );

    expect(r.found).toBe(true);
    expect(r.items).toEqual([]);
    expect(r.note).toContain('holds no requirement line');
  });

  it('reports a tree with no task checkbox WITH a note', () => {
    const r = speckit().tasks(new InMemoryFileSource({ 'specs/001-x/notes.md': 'nothing here' }));

    expect(r.note).toContain('holds no task checkbox in any `tasks.md`');
  });

  it('carries no note when it found something', () => {
    const files = new InMemoryFileSource(TREE);

    expect(speckit().requirements(files).note).toBeUndefined();
    expect(speckit().tasks(files).note).toBeUndefined();
  });

  it('skips a feature folder missing its spec or its task list, and still reads the others', () => {
    const files = new InMemoryFileSource({
      'specs/001-a/spec.md': '- **FR-001**: a MUST hold',
      'specs/002-b/tasks.md': '- [ ] b',
    });

    expect(
      speckit()
        .requirements(files)
        .items.map((i) => i.id),
    ).toEqual(['001-a#FR-001']);
    expect(
      speckit()
        .tasks(files)
        .items.map((i) => i.id),
    ).toEqual(['002-b#1']);
  });

  it('treats a FILE at the root as no Spec Kit tree', () => {
    expect(speckit().tasks(new InMemoryFileSource({ specs: 'a file, not a folder' })).found).toBe(false);
  });

  it('names itself, so a reconciliation can say which source found nothing', () => {
    expect(speckit().name).toBe('speckit');
  });
});

describe('task numbering', () => {
  it('numbers only the checkboxes — a heading or a note between tasks does not shift the ids', () => {
    // The id is the position among TASKS. Counted over every line, adding a heading above
    // task 2 would rename it, and whatever pinned `#2` would silently follow a different task.
    const r = speckit().tasks(
      new InMemoryFileSource({ 'specs/001-x/tasks.md': '# Phase 1\n- [ ] one\n\nA note.\n- [X] two\n' }),
    );

    expect(r.items).toEqual([
      { id: '001-x#1', title: 'one', done: false },
      { id: '001-x#2', title: 'two', done: true },
    ]);
  });
});

describe('speckit — its options', () => {
  it('refuses an option it does not have, by name, when the config loads', () => {
    expect(() => speckit({ task: 'tasks.md' } as never)).toThrow('`task` is not an option of speckit');
  });
});
