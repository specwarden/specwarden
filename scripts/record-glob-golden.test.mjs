/**
 * Pins the one thing `record-glob-golden.mjs` must never do: record on the wrong Node.
 *
 * The recording IS the engine's glob promise, and Node's own glob answered differently in
 * 24.9 and 24.21 on the same tree. Recorded on the wrong minor, the golden set would pin a
 * bug as the answer — so a run on any Node but the one the file names is refused before a
 * tree is built, and the file is left as it was.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = resolve('scripts/record-glob-golden.mjs');
const GOLDEN = resolve('core/src/infrastructure/_contract/glob/glob.golden.json');
const pinned = JSON.parse(readFileSync(GOLDEN, 'utf8')).node;

describe('record-glob-golden.mjs', () => {
  it('names a Node to record on, and it is a full version', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // On the pinned Node itself the script would really record, and rewrite the file.
  it.skipIf(process.versions.node === pinned)('refuses any other Node, and writes nothing', () => {
    const before = readFileSync(GOLDEN, 'utf8');
    let failure;
    try {
      execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      failure = error;
    }

    expect(failure?.status).toBe(1);
    expect(failure?.stderr).toContain(`recorded on node ${pinned}; this is ${process.versions.node}.`);
    expect(readFileSync(GOLDEN, 'utf8')).toBe(before);
  });
});
