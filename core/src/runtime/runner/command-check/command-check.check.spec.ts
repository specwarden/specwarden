import { describe, expect, it } from 'vitest';

import type { ICheckContext, IProcessResult } from '../../../domain';
import { runCheck } from '../../../testing';
import { CommandCheck, type ICommandCheckSpec } from './command-check.check';

/** A context carrying only what CommandCheck uses — a proc that records its last
 * invocation and returns a scripted result. */
function ctxWith(result: IProcessResult, shard?: string): { ctx: ICheckContext; lastCmd: () => string } {
  let last = '';
  const ctx = {
    changed: [],
    shard,
    files: {} as ICheckContext['files'],
    vcs: {} as ICheckContext['vcs'],
    clock: {} as ICheckContext['clock'],
    writer: {} as ICheckContext['writer'],
    proc: {
      run: (_command: string, args: readonly string[]) => {
        last = args[args.length - 1];
        return result;
      },
    },
  } satisfies ICheckContext;
  return { ctx, lastCmd: () => last };
}

describe('CommandCheck', () => {
  it('passes when the command exits 0 and declares only exec', () => {
    const check = new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'true' });
    expect(check.capabilities).toEqual(['exec']);
    expect(check.zone).toBe('consumer');
    const { ctx } = ctxWith({ status: 0, stdout: 'all good\n', stderr: '' });
    const verdict = check.run(ctx);
    expect(verdict.ok).toBe(true);
    expect(verdict.findings[0]?.message).toBe('all good');
  });

  it('fails when the command exits non-zero, and names the command', () => {
    const check = new CommandCheck({ id: 'lint', title: 'lint', tier: 'heavy', cmd: 'eslint .' });
    const { ctx } = ctxWith({ status: 2, stdout: '', stderr: 'boom\n' });
    const verdict = check.run(ctx);
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.some((f) => f.severity === 'error' && f.message.includes('eslint .'))).toBe(true);
  });

  it('an advisory command reports a warning, not an error', () => {
    const check = new CommandCheck({ id: 'shape', title: 'shape', tier: 'fast', cmd: 'plan-shape', advisory: true });
    const { ctx } = ctxWith({ status: 1, stdout: '', stderr: '' });
    const verdict = check.run(ctx);
    expect(verdict.ok).toBe(false);
    expect(verdict.findings.every((f) => f.severity !== 'error')).toBe(true);
  });

  it('appends --shard only when shardable and a shard was requested', () => {
    const shardable = new CommandCheck({ id: 't', title: 't', tier: 'heavy', cmd: 'jest', shardable: true });
    const withShard = ctxWith({ status: 0, stdout: '', stderr: '' }, '2/3');
    shardable.run(withShard.ctx);
    expect(withShard.lastCmd()).toBe('jest --shard=2/3');

    const plain = new CommandCheck({ id: 'p', title: 'p', tier: 'fast', cmd: 'node guard.mjs' });
    const withShard2 = ctxWith({ status: 0, stdout: '', stderr: '' }, '2/3');
    plain.run(withShard2.ctx);
    expect(withShard2.lastCmd()).toBe('node guard.mjs'); // not shardable → unchanged
  });

  it('honours its when predicate', () => {
    const check = new CommandCheck({
      id: 'be',
      title: 'be',
      tier: 'fast',
      cmd: 'x',
      when: (changed) => changed.some((f) => f.startsWith('be/')),
    });
    expect(check.when(['be/x.ts'])).toBe(true);
    expect(check.when(['fe/x.ts'])).toBe(false);
  });
});

describe('the shell is a setting, because not every machine has bash', () => {
  const ctxWith = (proc: { run: (c: string, a: readonly string[]) => unknown }) =>
    ({ proc }) as unknown as ICheckContext;

  it('runs through bash by default', () => {
    let spawned = '';
    const ctx = ctxWith({ run: (c, a) => ((spawned = `${c} ${a.join(' ')}`), { status: 0, stdout: '', stderr: '' }) });
    new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'echo hi' }).run(ctx);
    expect(spawned).toBe('bash -c echo hi');
  });

  it('uses the shell the check was given', () => {
    // A Windows checkout without Git Bash, a container with only `sh`, a repository
    // that runs everything through `pwsh` — all of them are ordinary, and none of them
    // should require forking the engine.
    let spawned = '';
    const ctx = ctxWith({ run: (c, a) => ((spawned = `${c} ${a.join(' ')}`), { status: 0, stdout: '', stderr: '' }) });
    new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'echo hi', shell: { command: 'sh', args: ['-c'] } }).run(
      ctx,
    );
    expect(spawned).toBe('sh -c echo hi');
  });

  it('says the SHELL is missing rather than blaming the command', () => {
    // Without this the verdict reads "<id> exited by signal — <cmd>", which sends the
    // reader to debug a command that never ran.
    const ctx = ctxWith({ run: () => ({ status: null, stdout: '', stderr: '', spawnError: 'spawnSync bash ENOENT' }) });
    const v = new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'echo hi' }).run(ctx) as IVerdict;
    expect(v.ok).toBe(false);
    const message = v.findings.map((f) => f.message).join('\n');
    expect(message).toContain("could not start the shell 'bash'");
    expect(message).toContain('shell');
  });

  it('still reports a real non-zero exit as the command failing', () => {
    const ctx = ctxWith({ run: () => ({ status: 3, stdout: '', stderr: 'boom' }) });
    const v = new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'false' }).run(ctx) as IVerdict;
    expect(v.findings.some((f) => f.message.includes('exited 3'))).toBe(true);
  });
});

/**
 * The declarations that make a zero exit answerable.
 *
 * Every case below is a shape that shipped green: a filter that matched no package, a
 * path list pointing at a file that had moved, a pipeline whose failure was swallowed.
 * In each one the command exited 0 and the gate reported success for months.
 */
describe('CommandCheck — a zero exit is not evidence of work', () => {
  const ran = (spec: Partial<ICommandCheckSpec>, result: IProcessResult, tree: Record<string, string> = {}) =>
    runCheck(new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'true', ...spec } as ICommandCheckSpec), {
      tree,
      exec: () => result,
    });

  it('fails a zero exit whose output does not carry the declared proof of work', async () => {
    const v = await ran({ expect: /(\d+) passed/ }, { status: 0, stdout: 'No test files found\n', stderr: '' });

    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('proof of work'))).toBe(true);
  });

  it('passes a zero exit that does carry it', async () => {
    const v = await ran({ expect: /(\d+) passed/ }, { status: 0, stdout: '86 passed\n', stderr: '' });

    expect(v.ok).toBe(true);
  });

  it('requires EVERY declared pattern, not any of them', async () => {
    const v = await ran({ expect: [/passed/, /86 files/] }, { status: 0, stdout: '86 passed\n', stderr: '' });

    expect(v.ok).toBe(false);
  });

  it('reads stderr as well as stdout — a tool may announce its own emptiness there', async () => {
    const v = await ran({ expect: /passed/ }, { status: 0, stdout: '', stderr: '86 passed\n' });

    expect(v.ok).toBe(true);
  });

  it('fails a zero exit whose output matches a refused pattern', async () => {
    const v = await ran(
      { refuse: [{ pattern: /No projects matched/, why: 'the filter names a package that does not exist.' }] },
      { status: 0, stdout: 'No projects matched the filters\n', stderr: '' },
    );

    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('does not exist.'))).toBe(true);
  });

  it('takes a bare pattern as a refusal too', async () => {
    const v = await ran({ refuse: [/no test files/i] }, { status: 0, stdout: 'No test files found\n', stderr: '' });

    expect(v.ok).toBe(false);
  });

  it('leaves a clean run alone when nothing is refused', async () => {
    const v = await ran({ refuse: [/no test files/i] }, { status: 0, stdout: '86 passed\n', stderr: '' });

    expect(v.ok).toBe(true);
  });

  it('does not second-guess a command that already failed', async () => {
    // `expect` exists to doubt a SUCCESS. Applying it to a failure would add a
    // confusing second finding to a verdict that is already correct.
    const v = await ran({ expect: /passed/ }, { status: 1, stdout: 'boom\n', stderr: '' });

    expect(v.findings.filter((f) => f.message.includes('proof of work'))).toHaveLength(0);
  });

  it('refuses to run at all when a path it is pointed at has moved', async () => {
    const v = await ran(
      { paths: ['src/a.test.ts', 'src/gone.test.ts'] },
      { status: 0, stdout: '', stderr: '' },
      { 'src/a.test.ts': '' },
    );

    expect(v.ok).toBe(false);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0].file).toBe('src/gone.test.ts');
  });

  it('runs when every declared path is on disk', async () => {
    const v = await ran(
      { paths: ['src/a.test.ts'] },
      { status: 0, stdout: 'ok\n', stderr: '' },
      { 'src/a.test.ts': '' },
    );

    expect(v.ok).toBe(true);
  });

  it('asks for the read capability exactly when it has paths to verify', () => {
    const withPaths = new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'true', paths: ['a'] });
    const without = new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'true' });

    expect(withPaths.capabilities).toEqual(['exec', 'read']);
    expect(without.capabilities).toEqual(['exec']);
  });

  it('takes the declarative relevance form', () => {
    const check = new CommandCheck({ id: 'x', title: 'x', tier: 'fast', cmd: 'true', when: { under: ['src/'] } });

    expect(check.when(['src/a.ts'])).toBe(true);
    expect(check.when(['docs/a.md'])).toBe(false);
  });
});
