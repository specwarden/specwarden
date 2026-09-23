import { existsSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SHELL } from '../../domain';
import { forgetPlatformShell, platformShell } from './platform-shell.adapter';

/**
 * The adapter over the real machine. `resolveShell` is pinned case by case in the domain;
 * what is pinned here is that the adapter hands it THIS machine, and remembers the answer.
 */
describe('platformShell', () => {
  afterEach(() => forgetPlatformShell());

  it('answers a shell whose executable this machine can start', () => {
    const shell = platformShell();

    // Off Windows it is the portable default; on Windows with Git installed it is Git's
    // bash, and the path it names exists — the whole point is never to hand back a name
    // that resolves to something else.
    if (process.platform !== 'win32') expect(shell).toEqual(DEFAULT_SHELL);
    else if (shell.command !== 'bash') expect(existsSync(shell.command)).toBe(true);
    expect(shell.args).toEqual(['-c']);
  });

  it('remembers the answer across calls, and forgets it on request', () => {
    const first = platformShell();

    expect(platformShell()).toBe(first);
    forgetPlatformShell();
    expect(platformShell()).not.toBe(first);
    expect(platformShell()).toEqual(first);
  });
});
