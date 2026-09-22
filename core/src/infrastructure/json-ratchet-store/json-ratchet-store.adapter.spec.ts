import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonRatchetStore, RatchetOverwriteError } from './json-ratchet-store.adapter';

describe('JsonRatchetStore — a debt counter that only turns down', () => {
  let dir: string;
  let store: JsonRatchetStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-ratchet-'));
    store = new JsonRatchetStore((id) => join(dir, `${id}.json`));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads back what establish wrote', () => {
    store.establish('r', 10);
    expect(store.read('r')).toEqual({ id: 'r', value: 10 });
  });

  it('establish refuses to overwrite an existing baseline', () => {
    store.establish('r', 10);
    expect(() => store.establish('r', 3)).toThrow(RatchetOverwriteError);
    expect(store.read('r')?.value).toBe(10);
  });

  it('tighten lowers, and never raises', () => {
    store.establish('r', 10);
    expect(store.tighten('r', 5).value).toBe(5);
    expect(store.tighten('r', 8).value).toBe(5); // 8 > 5: no-op, never raises
    expect(store.tighten('r', 3).value).toBe(3);
    expect(store.read('r')?.value).toBe(3);
  });

  it('tighten establishes a baseline when none exists', () => {
    expect(store.tighten('fresh', 7).value).toBe(7);
    expect(store.read('fresh')?.value).toBe(7);
  });

  it('no sequence of tightens ever increases the stored value', () => {
    store.establish('r', 100);
    let expected = 100;
    for (const v of [90, 95, 40, 60, 41, 5, 200, 6, 0, 1]) {
      const got = store.tighten('r', v).value;
      expected = Math.min(expected, v);
      expect(got).toBe(expected);
    }
    expect(store.read('r')?.value).toBe(0);
  });
});

describe('JsonRatchetStore — a floor that only turns up', () => {
  let dir: string;
  let store: JsonRatchetStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-ratchet-up-'));
    store = new JsonRatchetStore((id) => join(dir, `${id}.json`));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('raises, and never lowers', () => {
    store.establish('score', 68);
    expect(store.tighten('score', 71, 'up').value).toBe(71);
    expect(store.tighten('score', 61, 'up').value).toBe(71); // a drop is discarded
    expect(store.read('score')?.value).toBe(71);
  });

  it('the debt rule applied to a floor would erase it, which is why direction is declared', () => {
    store.establish('score', 68);
    expect(store.tighten('score', 0).value).toBe(0);
  });

  it('no sequence of tightens ever lowers a floor', () => {
    store.establish('score', 50);
    let expected = 50;
    for (const v of [60, 55, 80, 10, 81, 0, 79]) {
      const got = store.tighten('score', v, 'up').value;
      expected = Math.max(expected, v);
      expect(got).toBe(expected);
    }
    expect(store.read('score')?.value).toBe(81);
  });
});

describe('JsonRatchetStore — what else the file holds', () => {
  let dir: string;
  let store: JsonRatchetStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-ratchet-keep-'));
    store = new JsonRatchetStore((id) => join(dir, `${id}.json`));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps every key it does not own across a write', () => {
    // A ratchet file is read by people as often as by the engine, and what makes it
    // readable is the sentence saying what the number measures. Serialising only
    // { id, value } deleted that sentence on the first tighten: the number survived and
    // the only record of its meaning did not.
    writeFileSync(join(dir, 'r.json'), JSON.stringify({ id: 'r', value: 10, note: 'percent of mutants killed' }));

    store.tighten('r', 4);

    const after = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')) as Record<string, unknown>;
    expect(after).toEqual({ id: 'r', value: 4, note: 'percent of mutants killed' });
  });

  it('puts the two keys the engine owns first, so a reader meets them at the top', () => {
    writeFileSync(join(dir, 'r.json'), JSON.stringify({ note: 'why', value: 10, id: 'r' }));

    store.tighten('r', 4);

    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')) as object)).toEqual(['id', 'value', 'note']);
  });
});
