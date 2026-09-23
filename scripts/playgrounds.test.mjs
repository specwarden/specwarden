/**
 * Pins the pure parts of `playgrounds.mjs` and `playground-proof.mjs`: the tree walk, the
 * filter that decides which checks a template must prove, the environment every run
 * gets, and the scratch repository a scene runs in.
 *
 * The full scaffold — `init` into every template's repository, compared byte for byte —
 * is the `playgrounds` gate's job, and each template's own playground spec proves its
 * tree green and every check red. What those runs cannot show is that the instruments
 * they stand on are sound: a walk that descended into `node_modules`, a scratch copy that
 * committed its installed packages, a defect planted as a no-op. Any of those turns every
 * playground into a run over the wrong tree that still reports its result.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { HARNESS_CHECK_IDS } from 'specwarden';

import { planted } from './playground-proof.mjs';
import { playgroundEnv, removeScratch, scratchTree, treeOf, writtenByTemplate } from './playgrounds.mjs';

const made = [];

/** A temporary directory holding `files`, removed after the test. */
const dirWith = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'specwarden-tree-'));
  made.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
};

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe('walking a tree', () => {
  it('answers every file, relative, forward-slashed and sorted', () => {
    const dir = dirWith({ 'b.txt': '', 'a/z.txt': '', 'a/deep/y.txt': '' });

    expect(treeOf(dir)).toEqual(['a/deep/y.txt', 'a/z.txt', 'b.txt']);
  });

  it('never descends into node_modules or .git, at any depth', () => {
    // A copy that walked them would commit a consumer's installed packages into the
    // scratch repository, and every check would then examine the engine's own sources.
    const dir = dirWith({
      'kept.txt': '',
      'node_modules/pkg/index.js': '',
      '.git/HEAD': '',
      'nested/node_modules/pkg/index.js': '',
      'nested/.git/config': '',
    });

    expect(treeOf(dir)).toEqual(['kept.txt']);
  });

  it('honours skip for a directory and everything under it, and nothing that merely shares its prefix', () => {
    const dir = dirWith({
      '.specwarden/a.mjs': '',
      '.specwarden/checks/b.mjs': '',
      '.specwarden-notes.md': '',
      'x.md': '',
    });

    expect(treeOf(dir, { skip: ['.specwarden'] })).toEqual(['.specwarden-notes.md', 'x.md']);
  });

  it('answers nothing for a directory that does not exist, rather than throwing', () => {
    expect(treeOf(join(tmpdir(), 'specwarden-no-such-dir-at-all'))).toEqual([]);
  });
});

describe('the checks a template must prove', () => {
  it('knows the harness checks — an empty list would make every check a template wrote', () => {
    expect(HARNESS_CHECK_IDS.length).toBeGreaterThan(0);
  });

  it('drops exactly the harness checks, and keeps every other id in its order', () => {
    const ids = ['secret-scan', ...HARNESS_CHECK_IDS, 'doc-paths'];

    expect(writtenByTemplate(ids)).toEqual(['secret-scan', 'doc-paths']);
  });

  it('keeps an id that only resembles a harness check', () => {
    const lookalike = `${HARNESS_CHECK_IDS[0]}-extra`;

    expect(writtenByTemplate([lookalike])).toEqual([lookalike]);
  });
});

describe('the environment every spawned run gets', () => {
  it('asks for a full run with no colour, so the output parses the same everywhere', () => {
    const env = playgroundEnv();

    expect(env.SPECWARDEN_ALL).toBe('1');
    expect(env.NO_COLOR).toBe('1');
    expect(env.FORCE_COLOR).toBe('0');
  });

  it('drops NODE_PATH, so a scratch repository resolves only what it installed', () => {
    // pnpm's bin shim exports NODE_PATH at the workspace's node_modules, and a scratch
    // repository that installed only the engine then resolved every workspace package.
    const saved = process.env.NODE_PATH;
    process.env.NODE_PATH = join(tmpdir(), 'workspace-node-modules');
    try {
      expect(Object.keys(playgroundEnv())).not.toContain('NODE_PATH');
    } finally {
      if (saved === undefined) delete process.env.NODE_PATH;
      else process.env.NODE_PATH = saved;
    }
  });

  it('leaves the PATH exactly as it found it — the shell is the engine’s to resolve', () => {
    // It used to put Git's bash first on Windows, because a bare `bash` there is often
    // WSL's. The engine resolves Git's own bash itself now, and a playground run from
    // PowerShell proves it; a PATH arranged here would prove only the arrangement.
    const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path');
    expect(playgroundEnv()[key]).toBe(process.env[key]);
  });
});

describe('a scratch repository from a described tree', () => {
  const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

  it('tracks exactly the tree it was given, and not the packages linked beside it', () => {
    const source = dirWith({ 'package.json': '{ "name": "installed-thing" }\n' });
    const dir = scratchTree(
      { 'README.md': '# x\n', 'docs/a.md': 'a\n' },
      { installed: [['installed-thing', source]], branches: ['feature'] },
    );
    made.push(dir);

    expect(git(dir, 'ls-files').trim().split('\n')).toEqual(['README.md', 'docs/a.md']);
    // Installed, and resolvable, but not committed.
    expect(existsSync(join(dir, 'node_modules', 'installed-thing', 'package.json'))).toBe(true);
  });

  it('keeps node_modules out through .git/info/exclude, not by giving the tree a .gitignore', () => {
    // The repository under test is somebody's tree: a `.gitignore` it does not have would
    // be a file its own checks then read.
    const dir = scratchTree({ 'README.md': '# x\n' });
    made.push(dir);

    expect(readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8')).toContain('node_modules/');
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });

  it('is committed on main, with the branches asked for at the same commit', () => {
    const dir = scratchTree({ 'README.md': '# x\n' }, { branches: ['feature', 'main'] });
    made.push(dir);

    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main');
    expect(git(dir, 'rev-parse', 'feature').trim()).toBe(git(dir, 'rev-parse', 'main').trim());
    expect(git(dir, 'status', '--porcelain').trim()).toBe('');
  });

  it('is removed without following a linked package into the workspace copy it points at', () => {
    // The link is a junction to a REAL package directory. A removal that followed it would
    // delete the workspace's own source every time a scene cleaned up.
    const source = dirWith({ 'package.json': '{}\n', 'src/index.js': 'export {};\n' });
    const dir = scratchTree({ 'README.md': '# x\n' }, { installed: [['linked', source]] });

    removeScratch(dir);

    expect(existsSync(dir)).toBe(false);
    expect(existsSync(join(source, 'src', 'index.js'))).toBe(true);
  });
});

describe('planting a defect', () => {
  it('replaces the phrase it was given', () => {
    expect(planted('the plan is active', 'active', 'finished')).toBe('the plan is finished');
  });

  it('throws when the phrase is not in the file, rather than planting nothing', () => {
    // The scene would otherwise run over the clean tree, find the check green, and report
    // "the check missed the defect" about a defect that was never there. A typographic
    // apostrophe against an ASCII one did exactly that.
    expect(() => planted('it’s done', "it's done", 'x')).toThrow(
      /cannot plant the defect: "it's done" is not in the file/,
    );
  });
});
