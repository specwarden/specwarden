/**
 * Every generated file, against the registry it is generated from.
 *
 * WHY IT IS A CHECK AND NOT A HABIT. A generated file that somebody edited by hand
 * looks correct: it is valid JSON, the package installs, the tests pass. It stops
 * being correct at the next `pnpm scaffold`, which silently reverts the edit — and
 * the window between the two is exactly where a wrong version, a missing `files`
 * entry or a stale description ships to npm.
 *
 * It compares, it never writes. `pnpm scaffold` is the one thing that writes, and a
 * check that quietly repaired what it found would report success over a repository
 * nobody had looked at.
 *
 * Run: node scripts/check-scaffold-drift.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FLOOR_DOCUMENTS,
  NODE_FLOOR_START,
  generated,
  markedFloors,
  nodeFloor,
  withNodeFloor,
  withPackageTable,
} from './scaffold.mjs';

/**
 * What disagrees, as human strings. Empty means every generated file is current.
 *
 * `files` is path → what the scaffolder would write; `read(rel)` is what is committed, or
 * `undefined` when the file is absent. Both are handed in so the spec can plant a drift
 * without editing this repository — a comparison only reachable through the real tree
 * can only be tested in the one state where it passes.
 */
export function driftProblems(files, read) {
  const problems = [];

  for (const [rel, expected] of files) {
    const actual = read(rel);
    if (actual === undefined) {
      problems.push(`${rel}: missing — run \`pnpm scaffold\`.`);
      continue;
    }
    if (actual === expected) continue;

    // Naming the first differing line turns "something drifted" into a diff a reader can
    // act on without running the scaffolder to find out what changed.
    const a = actual.split('\n');
    const b = expected.split('\n');
    // When every committed line agrees, the committed file is a PREFIX of the generated
    // one — typically an editor that dropped the final newline — and the difference is
    // the line after its last. `findIndex` alone answered -1 there, and the report read
    // "line 0: (end of file) against (end of file)", which names no difference at all.
    const first = a.findIndex((line, i) => line !== b[i]);
    const at = first === -1 ? a.length : first;
    problems.push(
      `${rel}: differs from the registry at line ${at + 1}\n` +
        `      committed: ${JSON.stringify(a[at] ?? '(end of file)')}\n` +
        `      generated: ${JSON.stringify(b[at] ?? '(end of file)')}`,
    );
  }

  const readme = read('README.md');
  if (readme !== undefined && withPackageTable(readme) !== readme) {
    problems.push('README.md: the package table is out of date — run `pnpm scaffold`.');
  }

  for (const rel of FLOOR_DOCUMENTS) {
    const text = read(rel);
    if (text === undefined) continue;
    if (markedFloors(text) === 0) {
      // Unmarked, the floor in the prose is a copy nothing keeps current — or it is gone.
      problems.push(`${rel}: states no Node floor between ${NODE_FLOOR_START} markers — say which Node it needs.`);
    } else if (withNodeFloor(text) !== text) {
      problems.push(`${rel}: states a Node floor other than the registry's ${nodeFloor()} — run \`pnpm scaffold\`.`);
    }
  }

  return problems;
}

function main() {
  const ROOT = process.cwd();
  const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : undefined);
  const files = generated();
  const problems = driftProblems(files, read);

  if (problems.length > 0) {
    process.stderr.write(
      `${problems.length} generated file(s) disagree with scripts/registry.mjs:\n\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n\nThese files are DERIVED. Change `scripts/registry.mjs` and run `pnpm scaffold`;\n' +
        'a direct edit does not survive the next run, which is why it is caught here rather\n' +
        'than discovered after it has shipped.\n',
    );
    process.exit(1);
  }

  process.stdout.write(`✓ ${files.size} generated file(s) match the registry\n`);
}

if (process.argv[1]?.endsWith('check-scaffold-drift.mjs')) main();
