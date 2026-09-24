import { describe, expect, it } from 'vitest';

import type { IFileWriter, IVcs } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { testContext } from '../../../testing';
import { init } from './init.command';

async function setup(files: Record<string, string>, vcs?: IVcs) {
  const written = new Map<string, string>();
  const writer: IFileWriter = { write: (p, c) => void written.set(p, c) };
  let out = '';
  let err = '';
  const io = { out: (t: string) => (out += t), err: (t: string) => (err += t) };
  const code = await init(new InMemoryFileSource(files), writer, io, undefined, vcs);
  return { code, written, out, err };
}

/**
 * The "Detected:" line is the newcomer's only way to see WHY init wrote what it wrote.
 * Each fact named there changes the tree, so each is pinned to appear when detected
 * and to stay out when not — a line that claimed a workflow that is not there would
 * send the reader looking for a check that was correctly never written.
 */
describe('what init says it detected', () => {
  it('names the package manager, runner, workspace packages, docs, CI, spec framework, compose file and proxy', async () => {
    const h = await setup({
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - libs/*\n',
      'apps/web/package.json': '{}',
      'libs/money/package.json': '{}',
      'libs/time/package.json': '{}',
      'package.json': '{ "devDependencies": { "vitest": "1" } }',
      'docs/a.md': '#',
      '.github/workflows/deploy.yml': 'on: push',
      '.github/workflows/ci.yml': 'on: push',
      'openspec/project.md': '#',
      'compose.yaml': 'services: {}',
      'deploy/Caddyfile': 'x',
    });
    expect(h.code).toBe(0);
    // Packages the globs MATCH — two globs said "2 workspace(s)" over three packages — and
    // the workflow a ci-coverage example is pointed at.
    expect(h.out).toContain(
      'Detected: pnpm, test runner vitest, 3 workspace packages, docs in docs, github actions (.github/workflows/ci.yml), openspec specs, compose.yaml, deploy/Caddyfile\n',
    );
  });

  it('says one package in the singular, and names no workflow it did not find', async () => {
    const h = await setup({
      'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
      'apps/web/package.json': '{}',
      '.github/workflows/README.md': 'the workflows live elsewhere',
    });
    expect(h.out).toContain('1 workspace package, no documentation directory found, github actions\n');
  });

  it('names a test runner it does not recognise by the script, rather than a bare "other"', async () => {
    const h = await setup({ 'package.json': '{ "scripts": { "test": "node --test test/" } }' });
    expect(h.out).toContain('test script `node --test test/`');
    expect(h.out).not.toContain(', other');
  });

  it('says "unknown package manager" and "no documentation directory" rather than leaving a blank', async () => {
    const h = await setup({});
    expect(h.out).toContain('Detected: unknown package manager, no documentation directory found\n');
  });

  it('lists the modules it wired, or says none is installed', async () => {
    expect((await setup({ 'package.json': '{ "devDependencies": { "@specwarden/docs": "1" } }' })).out).toContain(
      'Wired: @specwarden/docs\n',
    );
    expect((await setup({})).out).toContain('No optional module installed');
  });

  it('prints no switched-off section when every file it wrote is live', async () => {
    expect((await setup({})).out).not.toContain('Switched OFF');
  });
});

describe('init degrades rather than crashes on a repository it cannot fully read', () => {
  it('still writes the tree when package.json does not parse', async () => {
    // Every other reader of the manifest degrades to "unknown"; the scripts list threw
    // a SyntaxError instead, so `init` on a repository with a half-edited manifest
    // crashed with a stack trace as the first thing the tool ever said.
    const h = await setup({ 'package.json': '{ "name": "x", ' });
    expect(h.code).toBe(0);
    expect(h.written.has('.specwarden/config.mjs')).toBe(true);
    expect(h.err).toBe('');
  });

  it('asks version control, not the filesystem, whether there is shell to check', async () => {
    // A check reads TRACKED files. Detecting an untracked script would write a shell
    // check that then reports it examined nothing — red on day one, caused by init.
    // The observable is the port being consulted at all.
    const asked: (string | undefined)[] = [];
    const base = testContext({ tree: {} }).vcs;
    const vcs: IVcs = {
      ...base,
      trackedFiles: (pathspec) => {
        asked.push(pathspec);
        return [];
      },
    };
    await setup({ 'deploy.sh': 'echo' }, vcs);
    expect(asked).toContain('*.sh');
  });
});
