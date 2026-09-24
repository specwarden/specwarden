/**
 * Pins `engine-node.mjs` — which Node the proofs run the engine on — and, above all, that
 * the CLI a playground runs is really running on it.
 *
 * The runtime matrix in CI is only as good as that last sentence. If `PLAYGROUND_NODE`
 * were read and then not used, every leg would run the engine on the development Node and
 * report the floor held — the defect this repository exists against, in the proof of its
 * own floor. So the engine is asked, from inside a check it loaded, what it runs on.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ENGINE_NODE, engineNode } from './engine-node.mjs';
import { ROOT, removeScratch, scratchTree, specwarden } from './playgrounds.mjs';

const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) removeScratch(dir);
});

const CONFIG = "import { defineConfig } from 'specwarden';\nexport default defineConfig({});\n";

/** A consumer check that fails with the version of the Node that loaded it. */
const REPORTS_ITS_NODE = `import { defineCheck } from 'specwarden';

export const check = defineCheck({
  id: 'runtime',
  title: 'the engine says which Node it runs on',
  tier: 'fast',
  run: () => ({ findings: [{ severity: 'error', message: \`node \${process.versions.node}\` }], examined: 1, unit: 'runtime' }),
});
`;

describe('the Node the engine runs on', () => {
  it('is the one running the suite, when none is named', () => {
    expect(engineNode(undefined)).toBe(process.execPath);
    expect(engineNode('')).toBe(process.execPath);
  });

  it('refuses a named binary that does not exist, rather than falling back to this one', () => {
    expect(() => engineNode(join(ROOT, 'no-such-node.exe'))).toThrow(/PLAYGROUND_NODE names .*no such file/);
  });

  it('is the one the CLI actually runs on — asked from inside a check the engine loaded', () => {
    const dir = scratchTree(
      { '.specwarden/config.mjs': CONFIG, '.specwarden/checks/runtime.check.mjs': REPORTS_ITS_NODE },
      { installed: [['specwarden', join(ROOT, 'core')]] },
    );
    made.push(dir);
    const expected = spawnSync(ENGINE_NODE, ['-p', 'process.versions.node'], { encoding: 'utf8' }).stdout.trim();

    const run = specwarden(dir, ['check', '--id', 'runtime', '--json']);
    const [result] = JSON.parse(run.stdout).results;

    expect(result.findings.map((f) => f.message)).toEqual([`node ${expected}`]);
    // Under the runtime matrix the named Node is an older one; the suite runs on 24.
    if (process.env.PLAYGROUND_NODE) expect(expected).not.toBe(process.versions.node);
  });
});
