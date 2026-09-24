import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IFileSource } from '../../../domain';
import { InMemoryFileSource } from '../../in-memory-file-source/in-memory-file-source.adapter';
import { NodeFileSource } from '../../node-file-source/node-file-source.adapter';
import { buildTree, fromRoot, goldenPlan, inRoot } from './glob-fixture.mjs';

/**
 * `glob` held to what Node 24.21's own `fs.globSync` answered, pattern by pattern, on the
 * trees in `glob.golden.json` — for both file sources.
 *
 * The engine walks trees itself because the runtime's glob is absent before Node 22 and
 * disagrees with itself across the minors after it. So the promise is not "whatever the
 * runtime says" but ONE recorded answer; this suite holds it on the Node the repository
 * develops on, and `core/_playground/runtime.test.mjs` holds the published build to the
 * same recording on every Node the engine supports.
 */
const SOURCES = [
  { source: 'disk', build: (root: string): IFileSource => new NodeFileSource(root) },
  {
    source: 'memory',
    build: (_root: string, files: readonly string[]): IFileSource =>
      new InMemoryFileSource(Object.fromEntries(files.map((f) => [f, f]))),
  },
] as const;

describe.each(SOURCES)('glob golden set — $source', ({ source, build }) => {
  for (const { name, section, skip, cases } of goldenPlan(source)) {
    if (skip) {
      it.skip(`${name}: ${skip}`, () => {});
      continue;
    }
    describe(`${name} — ${section.why}`, () => {
      let files: IFileSource;
      let root = '';
      let cleanup = (): void => {};
      beforeAll(() => {
        if (source === 'disk') ({ root, cleanup } = buildTree(section.tree));
        files = build(root, section.tree.files);
      });
      afterAll(() => cleanup());

      it.each(cases)('$pattern', ({ pattern, expected }) => {
        const answer = (): readonly string[] => fromRoot([...files.glob(inRoot(pattern, root))], root);
        if (expected && !Array.isArray(expected)) expect(answer).toThrow();
        else expect(answer()).toEqual(expected);
      });
    });
  }
});
