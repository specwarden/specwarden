import { describe, expect, it } from 'vitest';

import type { ICheck, IFileWriter } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { defineCheck, readTracked } from '../../../primitives';
import { errorsOf, runCheck } from '../../../testing';
import { newCheck } from './new-check.command';

function setup(tree: Record<string, string> = {}) {
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
  it('writes the body and its test side by side in the checks folder — the layout every guide shows', () => {
    const h = setup();

    const code = newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });

    expect(code).toBe(0);
    expect([...h.written.keys()]).toEqual([
      '.specwarden/checks/doc-shape.check.mjs',
      '.specwarden/checks/doc-shape.check.test.mjs',
    ]);
  });

  it('puts it under a family when one is named', () => {
    const h = setup();

    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden', family: 'docs' });

    expect([...h.written.keys()]).toEqual([
      '.specwarden/checks/docs/doc-shape.check.mjs',
      '.specwarden/checks/docs/doc-shape.check.test.mjs',
    ]);
  });

  it('scaffolds the SHAPE the engine wants, not a bare object literal', () => {
    // The whole value of a scaffold is that the defaults are already right. Sixteen
    // hand-written check files each re-derived these, and each got one of them wrong.
    const h = setup();
    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });
    const body = h.written.get('.specwarden/checks/doc-shape.check.mjs') as string;

    expect(body).toContain('defineCheck');
    expect(body).toContain("id: 'doc-shape'");
    expect(body).toContain('rule:'); // declared beside the check, not in a second list
    expect(body).toContain('corpus:'); // the empty-corpus refusal, on by default
    expect(body).not.toContain('contractVersion'); // never hand-written again
    expect(body).not.toContain('zone:');
  });

  /** The generated body, evaluated as the plain JavaScript it must be — with the engine's
   * own `defineCheck` and `readTracked` in place of its import. */
  const evaluate = (body: string): ICheck => {
    const source = body.replace(/^import .*$/m, '').replace('export const check =', 'return');
    return new Function('defineCheck', 'readTracked', source)(defineCheck, readTracked) as ICheck;
  };
  const scaffolded = (): string => {
    const h = setup();
    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });
    return h.written.get('.specwarden/checks/doc-shape.check.mjs') as string;
  };

  it('writes plain JavaScript — it held `as const`, and the next run died on a SyntaxError', () => {
    expect(scaffolded()).not.toMatch(/\bas const\b/);
    expect(() => evaluate(scaffolded())).not.toThrow();
  });

  it('is RED until its condition is written — even over a tree with nothing wrong', async () => {
    // The old body filtered on `false`: green over anything, a check that could not fail
    // from the day it was generated.
    const verdict = await runCheck(evaluate(scaffolded()), { tree: { 'docs/a.md': 'fine' } });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual([
      'the condition of doc-shape is not written yet — write `isWrong` in .specwarden/checks/doc-shape.check.mjs.',
    ]);
  });

  it('once the condition is written, is red over the defect and green over a clean tree', async () => {
    const written = scaffolded().replace(
      'const isWrong = undefined;',
      "const isWrong = (doc) => doc.text.includes('TODO');",
    );
    const check = evaluate(written);

    expect(errorsOf(await runCheck(check, { tree: { 'docs/a.md': 'a TODO' } }))).toEqual([
      'docs/a.md: say what is wrong and what to do about it.',
    ]);
    expect((await runCheck(check, { tree: { 'docs/a.md': 'fine' } })).ok).toBe(true);
    expect(check.title).toBe('state the assertion that must hold'); // the rule's statement
  });

  it('scaffolds a test whose failing case asserts the FAILURE, using the engine’s own kit', () => {
    const h = setup();
    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });
    const test = h.written.get('.specwarden/checks/doc-shape.check.test.mjs') as string;
    const failing = test.slice(test.indexOf("test('fails,"), test.indexOf("test('refuses"));

    expect(test).toContain('runCheck');
    expect(test).toContain('examined 0'); // the empty-corpus case, written for them
    // It asserted `ok === true` over "the wrong thing" — a test that passed against a
    // check that could not fail.
    expect(failing).toContain('assert.equal(verdict.ok, false);');
    expect(failing).not.toContain('assert.equal(verdict.ok, true);');
  });

  // Exit 2, "could not be used" — it was 1, the code a failed check answers with, so a
  // script could not tell a scaffold refused from a check that ran and said no.
  it('refuses to overwrite with exit 2, and writes nothing when it refuses', () => {
    const h = setup({ '.specwarden/checks/doc-shape.check.mjs': 'existing' });

    const code = newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });

    expect(code).toBe(2);
    expect(h.written.size).toBe(0);
    expect(h.err()).toContain('already exists');
  });

  it('refuses an id that is not a usable path segment or address', () => {
    for (const bad of ['Doc Shape', 'doc_shape', '-doc', 'doc--shape', 'docs/shape', '']) {
      const h = setup();
      expect(newCheck(h.files, h.writer, h.io, bad, { consumerDir: '.specwarden' }), bad).toBe(2);
      expect(h.written.size).toBe(0);
    }
  });

  it('asks for an id when none was given', () => {
    const h = setup();

    expect(newCheck(h.files, h.writer, h.io, undefined, { consumerDir: '.specwarden' })).toBe(2);
    expect(h.err()).toContain('usage:');
  });

  it('edits no declaration of the consumer’s — not the config, not the register', () => {
    const h = setup();
    newCheck(h.files, h.writer, h.io, 'doc-shape', { consumerDir: '.specwarden' });

    expect([...h.written.keys()].some((p) => p.includes('config.mjs') || p.includes('rules'))).toBe(false);
  });
});
