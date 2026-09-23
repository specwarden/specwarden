import { describe, expect, it } from 'vitest';

import type { IProcessOptions } from '../../../domain';
import { errorsOf, runCheck } from '../../../testing';
import { commandCheck } from './command-check.check';

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

/** A process that records where it was asked to run, and prints `stdout`. */
function recorder(stdout = 'ok') {
  const seen: (string | undefined)[] = [];
  const exec = (_command: string, _args: readonly string[], options?: IProcessOptions) => {
    seen.push(options?.cwd);
    return { status: 0, stdout, stderr: '' };
  };
  return { seen, exec };
}

describe('commandCheck — `cwd`, the directory a command runs in', () => {
  // A package's own suite in a monorepo had no way to say where it lives: every command
  // ran at the root, and `cd packages/api && …` was the workaround in every file.
  it('runs in the named directory, resolved against the repository root', async () => {
    const { seen, exec } = recorder();
    const check = commandCheck({ id: 'api-unit', cmd: 'pnpm test', cwd: 'packages/api/' });
    const verdict = await runCheck(check, { tree: { 'packages/api/package.json': '{}' }, root: '/repo', exec });

    expect(verdict.ok).toBe(true);
    expect(seen).toEqual(['/repo/packages/api']);
    expect(check.capabilities).toEqual(['exec', 'read']);
  });

  it('refuses a directory that is not there, without spawning — a `cd` into nothing exits 0', async () => {
    const { seen, exec } = recorder();
    const verdict = await runCheck(commandCheck({ id: 'api-unit', cmd: 'pnpm test', cwd: 'packages/gone' }), {
      tree: { 'packages/api/package.json': '{}' },
      exec,
    });

    expect(errorsOf(verdict)).toEqual([
      'api-unit runs in packages/gone, which is not a directory here — the command was not run.',
    ]);
    expect(verdict.findings[0].file).toBe('packages/gone');
    expect(seen).toEqual([]);
  });

  it('names no directory when none is given, or when it is the root itself', async () => {
    for (const cwd of [undefined, '.', '']) {
      const { seen, exec } = recorder();
      await runCheck(commandCheck({ id: 'x', cmd: 'true', ...(cwd === undefined ? {} : { cwd }) }), { exec });
      expect(seen, String(cwd)).toEqual([undefined]);
    }
    expect(commandCheck({ id: 'x', cmd: 'true' }).capabilities).toEqual(['exec']);
  });

  // An absolute path passed the directory check as itself and spawned beneath the root;
  // `..` ran the command outside the repository.
  it.each(['/abs', 'C:/x', 'C:\\x', '../other', 'packages/../../x'])(
    'refuses %s when the file loads — a directory inside the repository, relative to its root',
    (cwd) => {
      expect(() => commandCheck({ id: 'x', cmd: 'true', cwd })).toThrow(
        `commandCheck 'x': \`cwd\` must be a directory inside the repository, relative to its root — got "${cwd}".`,
      );
    },
  );

  it('is an option checked by name: a number is refused when the file loads', () => {
    expect(() => commandCheck({ id: 'x', cmd: 'true', cwd: 3 as unknown as string })).toThrow(/`cwd` must be a string/);
  });
});

describe('commandCheck — colour codes in a wrapped command', () => {
  // Under FORCE_COLOR a tool wrote escapes verbatim into findings and JSON, and an
  // `expect` written against the words failed on the escapes between them.
  it('are stripped from what the check reports and from what `expect` reads', async () => {
    const coloured = `${ESC}[32m# pass 3${ESC}[39m\n${ESC}]8;;https://x.invalid${BEL}link${ESC}]8;;${BEL}`;
    const { exec } = recorder(coloured);
    const verdict = await runCheck(commandCheck({ id: 'suite', cmd: 'node --test', expect: /^# pass [1-9]/m }), {
      exec,
    });

    expect(verdict.ok).toBe(true);
    expect(verdict.findings.map((f) => f.message)).toEqual(['# pass 3\nlink']);
    expect(JSON.stringify(verdict)).not.toContain(ESC);
  });
});
