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

  it('remembers the answer across calls', () => {
    const first = platformShell();

    expect(platformShell()).toBe(first);
  });

  // Off Windows the answer is one constant — there is nothing resolved to forget, and the
  // same object comes back either way. This case failed on every Linux run for as long as
  // it asserted a new object there; only Windows resolves a shell per environment.
  it.skipIf(process.platform !== 'win32')('forgets it on request, and resolves it again', () => {
    const first = platformShell();

    forgetPlatformShell();
    expect(platformShell()).not.toBe(first);
    expect(platformShell()).toEqual(first);
  });
});
