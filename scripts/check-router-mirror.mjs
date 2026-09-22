/**
 * CLAUDE.md against AGENTS.md. `--write` regenerates the mirror.
 *
 * Run: node scripts/check-router-mirror.mjs [--write]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CANON, MIRROR, assembleMirror, mirrorProblem } from './router-mirror.mjs';

const ROOT = process.cwd();
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : undefined);

const canon = read(CANON);

if (process.argv.includes('--write')) {
  if (canon === undefined) {
    process.stderr.write(`${CANON} is missing — there is nothing to mirror.\n`);
    process.exit(1);
  }
  writeFileSync(join(ROOT, MIRROR), assembleMirror(canon), 'utf8');
  process.stdout.write(`wrote ${MIRROR} from ${CANON}\n`);
  process.exit(0);
}

const problem = mirrorProblem(canon, read(MIRROR));
if (problem) {
  process.stderr.write(`${problem}\n`);
  process.exit(1);
}
process.stdout.write(`✓ ${MIRROR} is ${CANON}\n`);
