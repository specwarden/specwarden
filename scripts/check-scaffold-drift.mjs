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

import { generated, withPackageTable } from './scaffold.mjs';

const ROOT = process.cwd();

const problems = [];

for (const [rel, expected] of generated()) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) {
    problems.push(`${rel}: missing — run \`pnpm scaffold\`.`);
    continue;
  }
  const actual = readFileSync(full, 'utf8');
  if (actual === expected) continue;

  // Naming the first differing line turns "something drifted" into a diff a reader can
  // act on without running the scaffolder to find out what changed.
  const a = actual.split('\n');
  const b = expected.split('\n');
  const at = a.findIndex((line, i) => line !== b[i]);
  problems.push(
    `${rel}: differs from the registry at line ${at + 1}\n` +
      `      committed: ${JSON.stringify(a[at] ?? '(end of file)')}\n` +
      `      generated: ${JSON.stringify(b[at] ?? '(end of file)')}`,
  );
}

const readmePath = join(ROOT, 'README.md');
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, 'utf8');
  if (withPackageTable(readme) !== readme) {
    problems.push('README.md: the package table is out of date — run `pnpm scaffold`.');
  }
}

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

process.stdout.write(`✓ ${generated().size} generated file(s) match the registry\n`);
