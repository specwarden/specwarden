/**
 * Pins `router-mirror.mjs` and the script around it: `CLAUDE.md` is `AGENTS.md` plus a
 * header, or the gate fails.
 *
 * The one thing worth pinning beyond the comparison is the header. Without it the mirror
 * reads as the file to edit, and an edit there is the drift this gate exists for: a rule
 * changed in the copy one agent reads, and not in the canon every other agent reads.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { CANON, MIRROR, assembleMirror, mirrorProblem } from './router-mirror.mjs';

const SCRIPT = resolve('scripts/check-router-mirror.mjs');

/** The header alone: what the mirror is when the canon is empty. */
const HEADER = assembleMirror('');

let scratch = null;

/** A directory holding exactly the routers named, and nothing else. */
const treeWith = (files) => {
  scratch = mkdtempSync(join(tmpdir(), 'specwarden-router-'));
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(scratch, rel), text, 'utf8');
  return scratch;
};

/** The real script, run with `cwd` as the repository root it reads. Never throws. */
const runIn = (cwd, args = []) => {
  try {
    const output = execFileSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, output };
  } catch (error) {
    return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

describe('the mirror', () => {
  it('is the canon, verbatim, behind a header that says it is generated', () => {
    const canon = '# a router\n\nOne rule.\n';

    expect(assembleMirror(canon)).toBe(`${HEADER}${canon}`);
    expect(HEADER).toContain(`GENERATED from ${CANON}`);
    expect(HEADER).toContain('Do not edit');
    // The remedy is named in the file somebody is about to edit by mistake.
    expect(HEADER).toContain('pnpm check:router:write');
  });

  it('keeps the header in an HTML comment, so an agent rendering the router never reads it as a rule', () => {
    expect(HEADER.trimStart().startsWith('<!--')).toBe(true);
    expect(HEADER.trimEnd().endsWith('-->')).toBe(true);
  });

  it('holds for the file that is committed', () => {
    expect(readFileSync(MIRROR, 'utf8')).toBe(assembleMirror(readFileSync(CANON, 'utf8')));
  });
});

describe('what is wrong with a mirror', () => {
  const canon = '# a router\n\nOne rule.\n';

  it('is nothing when it is current', () => {
    expect(mirrorProblem(canon, assembleMirror(canon))).toBeUndefined();
  });

  it('refuses a missing canon, and says the mirror is derived from it', () => {
    expect(mirrorProblem(undefined, assembleMirror(canon))).toMatch(/AGENTS\.md is missing .* derived/);
  });

  it('refuses a missing mirror, and names the command that writes it', () => {
    expect(mirrorProblem(canon, undefined)).toContain('CLAUDE.md is missing — run `pnpm check:router:write`');
  });

  it('refuses a rule edited in the mirror and not in the canon', () => {
    // The failure the gate exists for: the copy says something the source does not.
    const drifted = assembleMirror(canon).replace('One rule.', 'A different rule.');

    expect(mirrorProblem(canon, drifted)).toContain('is not what AGENTS.md assembles to');
  });

  it('refuses a mirror that is a plain copy of the canon, header and all dropped', () => {
    // Identical words and still a defect: without the header nobody can tell which of the
    // two files is the one to edit, and the next edit lands in the wrong one.
    expect(mirrorProblem(canon, canon)).toContain('GENERATED');
  });
});

describe('check-router-mirror.mjs', () => {
  it('passes on the repository as it stands', () => {
    const result = runIn(process.cwd());

    expect(result.code).toBe(0);
    expect(result.output).toContain('✓ CLAUDE.md is AGENTS.md');
  });

  it('exits 1 over a drifted pair and says what to do', () => {
    const canon = '# a router\n\nOne rule.\n';
    const dir = treeWith({ [CANON]: canon, [MIRROR]: `${assembleMirror(canon)}\nA rule only one agent reads.\n` });

    const result = runIn(dir);

    expect(result.code).toBe(1);
    expect(result.output).toContain('put the change in AGENTS.md');
  });

  it('exits 1 when there is no mirror at all', () => {
    const result = runIn(treeWith({ [CANON]: '# a router\n' }));

    expect(result.code).toBe(1);
    expect(result.output).toContain('CLAUDE.md is missing');
  });

  it('repairs the mirror with --write, after which the check passes', () => {
    const canon = '# a router\n\nOne rule.\n';
    const dir = treeWith({ [CANON]: canon, [MIRROR]: 'stale\n' });

    const written = runIn(dir, ['--write']);

    expect(written.code).toBe(0);
    expect(readFileSync(join(dir, MIRROR), 'utf8')).toBe(assembleMirror(canon));
    expect(runIn(dir).code).toBe(0);
  });

  it('refuses --write with no canon, rather than writing a header over nothing', () => {
    const dir = treeWith({ [MIRROR]: 'stale\n' });

    const result = runIn(dir, ['--write']);

    expect(result.code).toBe(1);
    expect(result.output).toContain('nothing to mirror');
    expect(readFileSync(join(dir, MIRROR), 'utf8')).toBe('stale\n');
  });
});
