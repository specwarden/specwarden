/**
 * The published engine, on whatever Node runs this file, held to the glob golden set.
 *
 * vitest needs Node 20, so the unit suite never runs on the oldest Node the engine
 * declares — and the glob walk is the code that exists BECAUSE of the old ones. This file
 * is the proof that runs there: build-free ESM for `node --test`, importing the engine BY
 * NAME, so what it exercises is `dist` — what a consumer on that Node installs.
 *
 *   pnpm --filter specwarden build
 *   node --test core/_playground/runtime.test.mjs
 *
 * CI runs it once per supported Node line (`.github/workflows/ci.yml`, `runtimes`). The
 * cases are the vitest contract's (`file-source.glob.contract.spec.ts`) — one plan, read
 * from `glob.golden.json` — so the two can only disagree about the runtime.
 */
import assert from 'node:assert/strict';
// `node:test` is experimental on 18 and stable from 20; on 18.18 this file has been seen
// to run all of its cases. It is the instrument here, not something a consumer receives.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { after, before, describe, it } from 'node:test';

import { ChildProcessRunner, InMemoryFileSource, NodeFileSource } from 'specwarden';

import { buildTree, fromRoot, goldenPlan, inRoot } from '../src/infrastructure/_contract/glob/glob-fixture.mjs';

const BUILD = {
  disk: (root) => new NodeFileSource(root),
  memory: (_root, files) => new InMemoryFileSource(Object.fromEntries(files.map((f) => [f, f]))),
};

for (const source of ['disk', 'memory']) {
  describe(`glob golden set — ${source}, node ${process.versions.node}`, () => {
    for (const { name, section, skip, cases } of goldenPlan(source)) {
      if (skip) {
        it(`${name}: ${skip}`, { skip }, () => {});
        continue;
      }
      describe(name, () => {
        let files;
        let root = '';
        let cleanup = () => {};
        before(() => {
          if (source === 'disk') ({ root, cleanup } = buildTree(section.tree));
          files = BUILD[source](root, section.tree.files);
        });
        after(() => cleanup());

        for (const { pattern, expected } of cases) {
          it(JSON.stringify(pattern), () => {
            const answer = () => fromRoot([...files.glob(inRoot(pattern, root))], root);
            if (expected && !Array.isArray(expected)) assert.throws(answer);
            else assert.deepEqual(answer(), expected);
          });
        }
      });
    }
  });
}

/**
 * What a command check's verdict is decided from, on this Node: a process that ran and
 * failed, one that never started, and one killed on its timeout are three different
 * findings, and the runner tells them apart by fields `spawnSync` and `spawn` fill in —
 * a pid, an error, a status. No lint rule reads what a field MEANS on an older runtime.
 */
describe(`the process runner, node ${process.versions.node}`, () => {
  const runner = new ChildProcessRunner();
  const NODE = process.execPath;

  it('a process that ran and failed: its status, and no failure to start', async () => {
    for (const r of [
      runner.run(NODE, ['-e', 'process.exit(3)']),
      await runner.runAsync(NODE, ['-e', 'process.exit(3)']),
    ]) {
      assert.equal(r.status, 3);
      assert.equal(r.spawnError, undefined);
    }
  });

  it('a program that does not exist: a failure to start, and no status', async () => {
    for (const r of [
      runner.run('specwarden-no-such-program', []),
      await runner.runAsync('specwarden-no-such-program', []),
    ]) {
      assert.equal(r.status, null);
      assert.match(r.spawnError ?? '', /ENOENT/);
    }
  });

  it('a process killed on its timeout STARTED — it is not a failure to start', async () => {
    const forever = ['-e', 'setTimeout(() => {}, 20000)'];
    for (const r of [
      runner.run(NODE, forever, { timeoutSec: 0.5 }),
      await runner.runAsync(NODE, forever, { timeoutSec: 0.5 }),
    ]) {
      assert.equal(r.status, null);
      assert.equal(r.spawnError, undefined);
    }
  });
});
