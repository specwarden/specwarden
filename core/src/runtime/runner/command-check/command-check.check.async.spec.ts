import { describe, expect, it } from 'vitest';

import type { IProcessOptions, IProcessResult } from '../../../domain';
import { ChildProcessRunner } from '../../../infrastructure/child-process-runner/child-process-runner.adapter';
import { platformShell } from '../../../infrastructure/platform-shell/platform-shell.adapter';
import { errorsOf, testContext } from '../../../testing';
import { CommandCheck, commandCheck } from './command-check.check';

/**
 * The non-blocking path. When the process port offers `runAsync` the check must take
 * it — a synchronous spawn holds the event loop and turns `--jobs` into a queue — and
 * must reach the SAME verdict it would have reached synchronously, because the two
 * paths share one judge and a drift between them would pass a gate under one flag and
 * fail it under another.
 */
function asyncContext(result: IProcessResult) {
  const calls: { command: string; args: readonly string[]; options?: IProcessOptions; via: string }[] = [];
  const base = testContext({ tree: { 'spec/a.spec.ts': '' } });
  const ctx = {
    ...base,
    proc: {
      run: (command: string, args: readonly string[], options?: IProcessOptions) => {
        calls.push({ command, args, options, via: 'run' });
        return result;
      },
      runAsync: (command: string, args: readonly string[], options?: IProcessOptions) => {
        calls.push({ command, args, options, via: 'runAsync' });
        return Promise.resolve(result);
      },
    },
  };
  return { ctx, calls };
}

const spec = { id: 'suite', title: 'suite', tier: 'heavy' as const, cmd: 'run-suite' };

describe('CommandCheck — the async path', () => {
  it('prefers runAsync when the port offers it, and never also spawns synchronously', async () => {
    const { ctx, calls } = asyncContext({ status: 0, stdout: 'ok', stderr: '' });
    const verdict = await new CommandCheck(spec).run(ctx);

    expect(verdict.ok).toBe(true);
    expect(calls.map((c) => c.via)).toEqual(['runAsync']);
  });

  it('hands the async spawn the same shell, env and deadline the sync one would get', async () => {
    const { ctx, calls } = asyncContext({ status: 0, stdout: '', stderr: '' });
    await new CommandCheck({ ...spec, env: { STRICT: '1' }, timeoutSec: 30 }).run(ctx);

    expect(calls[0]).toMatchObject({
      command: platformShell().command,
      args: [...platformShell().args, 'run-suite'],
      options: { env: { STRICT: '1' }, timeoutSec: 30 },
    });
  });

  it('fails a non-zero exit on the async path exactly as on the sync one', async () => {
    const { ctx } = asyncContext({ status: 2, stdout: 'boom', stderr: '' });
    const verdict = await new CommandCheck(spec).run(ctx);

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual(['suite exited 2 — run-suite']);
  });

  it('still doubts a zero exit that lacks its proof of work on the async path', async () => {
    const { ctx } = asyncContext({ status: 0, stdout: 'No test files found', stderr: '' });
    const verdict = await new CommandCheck({ ...spec, expect: /\d+ passed/ }).run(ctx);

    expect(verdict.ok).toBe(false);
  });

  it('reports a shell that never started on the async path as a start failure', async () => {
    const { ctx } = asyncContext({ status: null, stdout: '', stderr: '', spawnError: 'spawn bash ENOENT' });
    const [message] = errorsOf(await new CommandCheck(spec).run(ctx));

    expect(message).toContain(`could not start the shell '${platformShell().command}'`);
    expect(message).toContain('spawn bash ENOENT');
  });
});

describe('CommandCheck — a command stopped by a signal', () => {
  /**
   * A killed command has no exit code. "exited null" reads as a bug in the check; the
   * phrase says what happened, and the sentence still names the command.
   */
  it('says the command was stopped by a signal rather than printing a null exit', async () => {
    const { ctx } = asyncContext({ status: null, stdout: '', stderr: '' });

    expect(errorsOf(await new CommandCheck(spec).run(ctx))).toEqual(['suite exited by signal — run-suite']);
  });
});

describe('commandCheck — the factory form', () => {
  it('builds the same check the class does, carrying every declaration', () => {
    const built = commandCheck({
      ...spec,
      needs: ['postgres'],
      exclusive: true,
      hint: 'start the db',
      zone: 'product',
    });

    expect(built).toBeInstanceOf(CommandCheck);
    expect(built).toMatchObject({
      id: 'suite',
      tier: 'heavy',
      cmd: 'run-suite',
      needs: ['postgres'],
      exclusive: true,
      hint: 'start the db',
      zone: 'product',
      advisory: false,
      capabilities: ['exec'],
    });
  });
});

describe('CommandCheck — against a real process', () => {
  /**
   * One end-to-end pass through the real runner, with node as the shell so the case
   * needs nothing the machine may lack. It is the proof the two halves agree on the
   * port's shape — the async result reaches the verdict, output and all.
   */
  it('runs a real command through the real runner and renders its output', async () => {
    const node = { command: process.execPath, args: ['-e'] };
    const base = testContext();
    const ctx = { ...base, proc: new ChildProcessRunner() };

    const passing = await commandCheck({
      ...spec,
      shell: node,
      cmd: 'console.log("12 passed")',
      expect: /12 passed/,
    }).run(ctx);
    expect(passing.ok).toBe(true);
    expect(passing.findings.map((f) => f.message)).toEqual(['12 passed']);

    const failing = await commandCheck({ ...spec, shell: node, cmd: 'process.exit(4)' }).run(ctx);
    expect(failing.ok).toBe(false);
    expect(errorsOf(failing)).toEqual(['suite exited 4 — process.exit(4)']);
  });
});
