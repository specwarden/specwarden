import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../../../infrastructure';
import { detectRepo } from './detect-repo.util';

describe('detectRepo', () => {
  it('reads a pnpm workspace with vitest and an agent router', () => {
    const files = new InMemoryFileSource({
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'packages:\n  - "fe"\n  - "packages/**"\n',
      'package.json': '{ "devDependencies": { "vitest": "^4.0.0" } }',
      'AGENTS.md': '# router\n',
      'docs/x.md': '',
    });
    const shape = detectRepo(files);
    expect(shape.packageManager).toBe('pnpm');
    expect(shape.workspaces).toEqual(['fe', 'packages/**']);
    expect(shape.testRunner).toBe('vitest');
    expect(shape.hasAgentRouter).toBe(true);
    expect(shape.docDirs).toEqual(['docs']);
  });

  it('takes only the packages: list, not another list in the same file', () => {
    const files = new InMemoryFileSource({
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml':
        'packages:\n  - "fe"\n  - "packages/**"\n\nonlyBuiltDependencies:\n  - esbuild\n  - sharp\n',
    });
    expect(detectRepo(files).workspaces).toEqual(['fe', 'packages/**']);
  });

  it('reads npm workspaces from package.json and jest', () => {
    const files = new InMemoryFileSource({
      'package-lock.json': '',
      'package.json': '{ "workspaces": ["a", "b"], "devDependencies": { "jest": "^29" } }',
    });
    const shape = detectRepo(files);
    expect(shape.packageManager).toBe('npm');
    expect(shape.workspaces).toEqual(['a', 'b']);
    expect(shape.testRunner).toBe('jest');
    expect(shape.hasAgentRouter).toBe(false);
    expect(shape.docDirs).toEqual([]);
  });

  it('degrades to unknown rather than guessing', () => {
    const shape = detectRepo(new InMemoryFileSource({}));
    expect(shape.packageManager).toBeUndefined();
    expect(shape.workspaces).toEqual([]);
    expect(shape.testRunner).toBeUndefined();
  });
});

describe('what a template needs to know before it writes anything', () => {
  it('names the CI system, because a coverage check with no workflow reconciles against nothing', () => {
    expect(detectRepo(new InMemoryFileSource({ '.github/workflows/ci.yml': 'name: ci' })).ci).toBe('github');
    expect(detectRepo(new InMemoryFileSource({ '.gitlab-ci.yml': 'stages: []' })).ci).toBe('gitlab');
    expect(detectRepo(new InMemoryFileSource({})).ci).toBeUndefined();
  });

  it('recognises each spec framework by the directory only it puts in a repository', () => {
    expect(detectRepo(new InMemoryFileSource({ 'openspec/specs/x/spec.md': '' })).specFramework).toBe('openspec');
    expect(detectRepo(new InMemoryFileSource({ 'specs/f/spec.md': '' })).specFramework).toBe('speckit');
    expect(detectRepo(new InMemoryFileSource({ 'docs/a.md': '' })).specFramework).toBeUndefined();
  });

  it('lists compose files in the order docker reads them, so the first is the one to name', () => {
    const shape = detectRepo(new InMemoryFileSource({ 'docker-compose.yml': '', 'compose.yaml': '' }));
    expect(shape.composeFiles).toEqual(['compose.yaml', 'docker-compose.yml']);
    expect(detectRepo(new InMemoryFileSource({})).composeFiles).toEqual([]);
  });

  it('asks about shell the way the CHECK will ask — tracked files, not the filesystem', () => {
    // The defect: a repository whose first commit has not happened yet HAS scripts on
    // disk and none tracked. Detecting from disk writes the check; the check then
    // reports that it examined nothing and fails — a red first run caused by the
    // scaffold rather than by the repository.
    const files = new InMemoryFileSource({ 'scripts/deploy.sh': '#!/bin/sh\n' });
    const vcs = { trackedFiles: () => [] } as unknown as Parameters<typeof detectRepo>[1];
    expect(detectRepo(files, vcs)?.hasShellScripts).toBe(false);

    const tracked = {
      trackedFiles: (p: string) => (p === 'scripts/**/*.sh' ? ['scripts/deploy.sh'] : []),
    } as unknown as Parameters<typeof detectRepo>[1];
    expect(detectRepo(files, tracked)?.hasShellScripts).toBe(true);
  });

  it('falls back to the filesystem for a caller with no VCS port', () => {
    expect(detectRepo(new InMemoryFileSource({ 'scripts/deploy.sh': '' })).hasShellScripts).toBe(true);
    expect(detectRepo(new InMemoryFileSource({ 'src/a.ts': '' })).hasShellScripts).toBe(false);
  });
});

describe('detectRepo — the facts an example is pointed at', () => {
  it('counts the package directories the workspace globs match, a negation excluding', () => {
    // A glob is one line of configuration; `packages/*` over three packages is three.
    const shape = detectRepo(
      new InMemoryFileSource({
        'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - 'tools/'\n  - '!packages/legacy'\n",
        'packages/api/package.json': '{}',
        'packages/web/package.json': '{}',
        'packages/legacy/package.json': '{}',
        'packages/notes/README.md': '#',
        'tools/package.json': '{}',
      }),
    );
    expect(shape.workspaces).toEqual(['packages/*', 'tools/', '!packages/legacy']);
    expect(shape.workspacePackages).toEqual(['packages/api', 'packages/web', 'tools']);
  });

  it('keeps the test script verbatim, for a runner it cannot name', () => {
    const shape = detectRepo(new InMemoryFileSource({ 'package.json': '{ "scripts": { "test": "node --test" } }' }));
    expect(shape.testRunner).toBe('other');
    expect(shape.testScript).toBe('node --test');
    expect(detectRepo(new InMemoryFileSource({ 'package.json': '{ "scripts": 3 }' })).testScript).toBeUndefined();
    expect(detectRepo(new InMemoryFileSource({ 'package.json': '{ nope' })).testScript).toBeUndefined();
  });

  it('lists the workflows, the conventional ci one first, and GitLab’s file', () => {
    const shape = detectRepo(
      new InMemoryFileSource({
        '.github/workflows/deploy.yml': '',
        '.github/workflows/ci.yaml': '',
        '.github/workflows/audit.yml': '',
        '.gitlab-ci.yml': '',
      }),
    );
    expect(shape.workflows).toEqual([
      '.github/workflows/ci.yaml',
      '.github/workflows/audit.yml',
      '.github/workflows/deploy.yml',
      '.gitlab-ci.yml',
    ]);
    expect(detectRepo(new InMemoryFileSource({})).workflows).toEqual([]);
  });

  it('finds a Caddyfile or an nginx config wherever it is kept, and the env sample beside a compose file', () => {
    const shape = detectRepo(
      new InMemoryFileSource({
        'deploy/nginx/upstreams.conf': '',
        'infra/Caddyfile.prod': '',
        '.env.example': 'A=',
        'compose.yaml': '',
      }),
    );
    expect(shape.proxyConfigs).toEqual(['infra/Caddyfile.prod', 'deploy/nginx/upstreams.conf']);
    expect(shape.envSamples).toEqual(['.env.example']);
  });

  it('asks version control for the proxy config and the workflows when it has a port', () => {
    const asked: string[] = [];
    const vcs = {
      trackedFiles: (p: string) => {
        asked.push(p);
        return p === '**/nginx/**/*.conf' ? ['deploy/nginx/site.conf'] : [];
      },
    } as unknown as Parameters<typeof detectRepo>[1];
    const shape = detectRepo(new InMemoryFileSource({ 'deploy/nginx/untracked.conf': '' }), vcs);
    expect(shape.proxyConfigs).toEqual(['deploy/nginx/site.conf']);
    expect(asked).toContain('.github/workflows/*.yml');
  });
});
