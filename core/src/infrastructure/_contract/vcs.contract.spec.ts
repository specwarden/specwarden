import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IVcs } from '../../domain';
import { testContext } from '../../testing/test-context/test-context.util';
import { ChildProcessRunner } from '../child-process-runner/child-process-runner.adapter';
import { GitVcs } from '../git-vcs/git-vcs.adapter';

/**
 * ONE reading of a pathspec, held against a real repository and against the test kit.
 *
 * WHY THIS SUITE EXISTS. The file source has had a contract like this from the start; the
 * VCS port had none, and the two sides disagreed for as long as both existed. The real
 * adapter handed pathspecs to git as written — where `**\/*.md` skips every root document
 * and `*` crosses directories — while the test kit matched with globstar semantics. Every
 * documentation check was unit-tested over a `README.md` that the real run never read.
 *
 * So each case below runs twice, and the cases are the ones the divergence hid in: a root
 * file under `**`, a single `*` that must NOT descend, a directory named literally, a
 * dotfile a wildcard must still reach (git has no dotfile rule), and the empty pathspec
 * that means "everything" rather than "nothing".
 */
const TREE: Readonly<Record<string, string>> = {
  'README.md': '# root\n',
  '.env.example': 'TOKEN=\n',
  'docs/a.md': 'a\n',
  'docs/.hidden.md': 'h\n',
  'docs/sub/c.md': 'c\n',
  'src/index.ts': 'export {};\n',
  'src/deep/y.ts': 'export {};\n',
  '.claude/agents/lead.md': '---\nname: lead\n---\n',
  'scripts/deploy.sh': 'echo\n',
};

const CASES: readonly (readonly [string | undefined, readonly string[]])[] = [
  [undefined, Object.keys(TREE)],
  ['', Object.keys(TREE)],
  // The case that started it: root documents are documents.
  ['**/*.md', ['.claude/agents/lead.md', 'README.md', 'docs/.hidden.md', 'docs/a.md', 'docs/sub/c.md']],
  // A single star stays in its directory.
  ['*.md', ['README.md']],
  ['docs/*.md', ['docs/.hidden.md', 'docs/a.md']],
  // A middle `**` spans ZERO directories as well as several.
  ['src/**/*.ts', ['src/deep/y.ts', 'src/index.ts']],
  ['docs/**', ['docs/.hidden.md', 'docs/a.md', 'docs/sub/c.md']],
  // A literal names a file, or everything under a directory — never a prefix of a name.
  ['docs', ['docs/.hidden.md', 'docs/a.md', 'docs/sub/c.md']],
  ['doc', []],
  ['README.md', ['README.md']],
  ['.claude/agents/*.md', ['.claude/agents/lead.md']],
  ['*', ['.env.example', 'README.md']],
];

function gitRepository(): { vcs: IVcs; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'spw-vcs-'));
  for (const [path, content] of Object.entries(TREE)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '--quiet');
  git('add', '--all');
  return {
    vcs: new GitVcs(new ChildProcessRunner(), dir),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const IMPLEMENTATIONS = [
  { name: 'GitVcs over a real repository', build: gitRepository },
  {
    name: 'the test kit, over the same tree',
    build: () => ({ vcs: testContext({ tree: TREE }).vcs, cleanup: () => {} }),
  },
  {
    // The explicit list is the form most specs use, and it was returned whole whatever
    // was asked — so it is held to the same reading as the other two.
    name: 'the test kit, with an explicit tracked list',
    build: () => ({ vcs: testContext({ tree: TREE, tracked: Object.keys(TREE) }).vcs, cleanup: () => {} }),
  },
];

describe.each(IMPLEMENTATIONS)('IVcs.trackedFiles contract — $name', ({ build }) => {
  let vcs: IVcs;
  let cleanup: () => void;
  beforeAll(() => {
    ({ vcs, cleanup } = build());
  });
  afterAll(() => cleanup());

  it.each(CASES)('%s selects exactly what git’s glob reading selects', (pathspec, expected) => {
    expect([...vcs.trackedFiles(pathspec)].sort()).toEqual([...expected].sort());
  });
});
