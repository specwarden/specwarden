/**
 * Pins `check-scaffold-drift.mjs`: a generated file edited by hand, deleted, or left
 * behind by a registry change is refused, and the refusal names the line.
 *
 * The comparison is driven through `driftProblems` with a committed tree held in memory,
 * so each case breaks exactly one file of the real generated map and nothing on disk.
 * The script itself is spawned twice: over this repository, where it must pass, and over
 * a scratch tree the scaffolder has just written, where it must pass and then fail on one
 * planted edit — the wiring from `cwd` to the comparison, which no in-memory case reaches.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { driftProblems } from './check-scaffold-drift.mjs';
import { PACKAGES, pkgDir } from './registry.mjs';
import { PACKAGE_TABLE_END, PACKAGE_TABLE_START, generated, packageTable } from './scaffold.mjs';

const SCRIPT = resolve('scripts/check-scaffold-drift.mjs');
const SCAFFOLD = resolve('scripts/scaffold.mjs');

const FILES = generated();
const README = `# specwarden\n\n${packageTable()}\n`;
const MANIFEST = `${pkgDir(PACKAGES[1])}/package.json`;

/** A committed tree equal to what the scaffolder generates, with `edits` over it —
 * a string replaces a file, `null` deletes it. */
const committed = (edits = {}) => {
  const tree = new Map([...FILES, ['README.md', README]]);
  for (const [rel, text] of Object.entries(edits)) {
    if (text === null) tree.delete(rel);
    else tree.set(rel, text);
  }
  return (rel) => tree.get(rel);
};

const run = (cwd) => {
  try {
    return { code: 0, output: execFileSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

describe('what drift is', () => {
  it('is nothing when every committed file is what the registry generates', () => {
    expect(driftProblems(FILES, committed())).toEqual([]);
  });

  it('refuses a generated file that was deleted', () => {
    const rel = `${pkgDir(PACKAGES[2])}/LICENSE`;

    expect(driftProblems(FILES, committed({ [rel]: null }))).toEqual([`${rel}: missing — run \`pnpm scaffold\`.`]);
  });

  it('names the first line that differs, with both versions of it', () => {
    // A hand edit to a manifest: valid JSON, installs, passes every test — and reverted
    // by the next scaffold run. The report is what makes it a diff and not a mystery.
    const edited = FILES.get(MANIFEST).replace('"type": "module"', '"type": "commonjs"');
    const line = edited.split('\n').findIndex((l) => l.includes('commonjs')) + 1;

    const [problem, ...rest] = driftProblems(FILES, committed({ [MANIFEST]: edited }));

    expect(rest).toEqual([]);
    expect(problem).toContain(`${MANIFEST}: differs from the registry at line ${line}`);
    expect(problem).toContain('committed: "  \\"type\\": \\"commonjs\\","');
    expect(problem).toContain('generated: "  \\"type\\": \\"module\\","');
  });

  it('names a real line when the only difference is a dropped final newline', () => {
    // The defect this case was written against: every committed line agreed, so the
    // search for a differing one found none and the report said "line 0 — (end of file)
    // against (end of file)", naming no difference at all.
    const rel = `${pkgDir(PACKAGES[1])}/LICENSE`;
    const truncated = FILES.get(rel).replace(/\n$/, '');

    const [problem] = driftProblems(FILES, committed({ [rel]: truncated }));

    expect(problem).not.toContain('at line 0');
    expect(problem).toContain(`at line ${truncated.split('\n').length + 1}`);
    expect(problem).toContain('committed: "(end of file)"');
    expect(problem).toContain('generated: ""');
  });

  it('refuses a README whose package table is stale', () => {
    const stale = README.replace(
      packageTable(),
      `${PACKAGE_TABLE_START}\n| a package that left |\n${PACKAGE_TABLE_END}`,
    );

    expect(driftProblems(FILES, committed({ 'README.md': stale }))).toEqual([
      'README.md: the package table is out of date — run `pnpm scaffold`.',
    ]);
  });

  it('says nothing about a README that has none, since the table is only filled where it is marked', () => {
    expect(driftProblems(FILES, committed({ 'README.md': null }))).toEqual([]);
  });

  it('reports every drifted file, not the first', () => {
    const problems = driftProblems(
      FILES,
      committed({ [MANIFEST]: '{}\n', [`${pkgDir(PACKAGES[3])}/README.md`]: null, 'llms.txt': 'stale\n' }),
    );

    expect(problems).toHaveLength(3);
  });
});

describe('check-scaffold-drift.mjs', () => {
  let scratch = null;

  afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    scratch = null;
  });

  it('passes on the repository as it stands, and says how many files it compared', () => {
    const result = run(process.cwd());

    expect(result.code).toBe(0);
    expect(result.output).toContain(`✓ ${FILES.size} generated file(s) match the registry`);
  });

  it('passes over a tree the scaffolder just wrote, then fails on one hand edit and names it', () => {
    // The two scripts read one registry through one `cwd`. If they ever disagree about a
    // tree, every run of `pnpm scaffold` would leave the gate red — or, worse, green over
    // files it is not looking at.
    scratch = mkdtempSync(join(tmpdir(), 'specwarden-drift-'));
    mkdirSync(join(scratch, 'skills'));
    writeFileSync(join(scratch, 'README.md'), `# x\n\n${PACKAGE_TABLE_START}\n${PACKAGE_TABLE_END}\n`, 'utf8');
    execFileSync(process.execPath, [SCAFFOLD], { cwd: scratch, stdio: 'pipe' });

    expect(run(scratch).code).toBe(0);

    const target = join(scratch, MANIFEST);
    writeFileSync(target, readFileSync(target, 'utf8').replace('"sideEffects": false', '"sideEffects": true'), 'utf8');

    const result = run(scratch);

    expect(result.code).toBe(1);
    expect(result.output).toContain('1 generated file(s) disagree with scripts/registry.mjs');
    expect(result.output).toContain(MANIFEST);
  });
});
