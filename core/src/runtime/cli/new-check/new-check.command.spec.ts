import { describe, expect, it } from 'vitest';

import type { IFileWriter } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { newCheck } from './new-check.command';

function harness(tree: Record<string, string> = {}) {
  const written = new Map<string, string>();
  const writer: IFileWriter = { write: (path, content) => void written.set(path, content) };
  let out = '';
  let err = '';
  return {
    written,
    writer,
    files: new InMemoryFileSource(tree),
    io: { out: (t: string) => (out += t), err: (t: string) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

describe('specwarden new', () => {
  it('writes the body and its test, folder per check', () => {
    const h = harness();

    const code = newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });

    expect(code).toBe(0);
    expect([...h.written.keys()]).toEqual([
      '.specwarden/checks/doc-shape/doc-shape.check.mjs',
      '.specwarden/checks/doc-shape/doc-shape.check.test.mjs',
    ]);
  });

  it('puts it under a family when one is named', () => {
    const h = harness();

    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden', family: 'docs' });

    expect([...h.written.keys()][0]).toBe('.specwarden/checks/docs/doc-shape/doc-shape.check.mjs');
  });

  it('scaffolds the SHAPE the engine wants, not a bare object literal', () => {
    // The whole value of a scaffold is that the defaults are already right. Sixteen
    // hand-written check files each re-derived these, and each got one of them wrong.
    const h = harness();
    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });
    const body = h.written.get('.specwarden/checks/doc-shape/doc-shape.check.mjs') as string;

    expect(body).toContain('defineCheck');
    expect(body).toContain("id: 'doc-shape'");
    expect(body).toContain('rule:'); // declared beside the check, not in a second list
    expect(body).toContain('corpus:'); // the empty-corpus refusal, on by default
    expect(body).not.toContain('contractVersion'); // never hand-written again
    expect(body).not.toContain('zone:');
  });

  it('scaffolds a test that uses the engine’s own kit', () => {
    const h = harness();
    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });
    const test = h.written.get('.specwarden/checks/doc-shape/doc-shape.check.test.mjs') as string;

    expect(test).toContain('runCheck');
    expect(test).toContain('examined 0'); // the empty-corpus case, written for them
  });

  it('refuses to overwrite, and writes nothing when it refuses', () => {
    const h = harness({ '.specwarden/checks/doc-shape/doc-shape.check.mjs': 'existing' });

    const code = newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });

    expect(code).toBe(1);
    expect(h.written.size).toBe(0);
    expect(h.err()).toContain('already exists');
  });

  it('refuses an id that is not a usable path segment or address', () => {
    for (const bad of ['Doc Shape', 'doc_shape', '-doc', 'doc--shape', 'docs/shape', '']) {
      const h = harness();
      expect(newCheck(h.files, h.writer, h.io, bad, { consumerDir: '.specwarden' }), bad).toBe(2);
      expect(h.written.size).toBe(0);
    }
  });

  it('asks for an id when none was given', () => {
    const h = harness();

    expect(newCheck(h.files, h.writer, h.io, undefined, { consumerDir: '.specwarden' })).toBe(2);
    expect(h.err()).toContain('usage:');
  });

  it('edits no declaration of the consumer’s — not the config, not the register', () => {
    const h = harness();
    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });

    expect([...h.written.keys()].some((p) => p.includes('warden.config') || p.includes('rules'))).toBe(false);
  });
});
