import { describe, expect, it } from 'vitest';

import type { IFileWriter, IVcs } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { testContext } from '../../../testing';
import { init } from './init.command';

async function harness(files: Record<string, string>, vcs?: IVcs) {
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
  it('names the package manager, runner, workspaces, docs, CI, spec framework and compose file it found', async () => {
    const h = await harness({
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - libs/*\n',
      'package.json': '{ "devDependencies": { "vitest": "1" } }',
      'docs/a.md': '#',
      '.github/workflows/ci.yml': 'on: push',
      'openspec/project.md': '#',
      'compose.yaml': 'services: {}',
    });
    expect(h.code).toBe(0);
    expect(h.out).toContain(
      'Detected: pnpm, vitest, 2 workspace(s), docs in docs, github actions, openspec specs, compose.yaml\n',
    );
  });

  it('says "unknown package manager" and "no documentation directory" rather than leaving a blank', async () => {
    const h = await harness({});
    expect(h.out).toContain('Detected: unknown package manager, no documentation directory found\n');
  });

  it('lists the modules it wired, or says none is installed', async () => {
    expect((await harness({ 'package.json': '{ "devDependencies": { "@specwarden/docs": "1" } }' })).out).toContain(
      'Wired: @specwarden/docs\n',
    );
    expect((await harness({})).out).toContain('No optional module installed');
  });

  it('prints no switched-off section when every file it wrote is live', async () => {
    expect((await harness({})).out).not.toContain('Switched OFF');
  });
});

describe('init degrades rather than crashes on a repository it cannot fully read', () => {
  it('still writes the tree when package.json does not parse', async () => {
    // Every other reader of the manifest degrades to "unknown"; the scripts list threw
    // a SyntaxError instead, so `init` on a repository with a half-edited manifest
    // crashed with a stack trace as the first thing the tool ever said.
    const h = await harness({ 'package.json': '{ "name": "x", ' });
    expect(h.code).toBe(0);
    expect(h.written.has('.specwarden/warden.config.mjs')).toBe(true);
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
    await harness({ 'deploy.sh': 'echo' }, vcs);
    expect(asked).toContain('*.sh');
  });
});
