import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IProcessOptions, IProcessResult } from '../../domain';
import { ChildProcessRunner } from './child-process-runner.adapter';

/**
 * The real subprocess adapter, driven with real children. A fake here would test the
 * fake: the whole value of this file is the translation between the port's shape and
 * what `spawnSync` / `spawn` actually report, and that is only observable on a process.
 *
 * `process.execPath` with `-e` is the one binary guaranteed to exist on every machine
 * that can run this suite, so no case depends on the host having bash.
 *
 * BOTH twins run through ONE list of cases. `runAsync` promises the same contract as
 * `run`, and a divergence between them is invisible from either side alone: the runner
 * picks the async path when it exists, so the sync one is what a consumer's own
 * adapter and every non-concurrent caller get.
 */
const NODE = process.execPath;
const runner = new ChildProcessRunner();

const TWINS: readonly {
  name: string;
  exec: (command: string, args: readonly string[], options?: IProcessOptions) => Promise<IProcessResult>;
}[] = [
  { name: 'run', exec: async (c, a, o) => runner.run(c, a, o) },
  { name: 'runAsync', exec: (c, a, o) => runner.runAsync(c, a, o) },
];

const script = (body: string) => ['-e', body];

describe.each(TWINS)('ChildProcessRunner.$name', ({ exec }) => {
  it('reports the exit status the child chose, not a normalised pass/fail', async () => {
    const result = await exec(NODE, script('process.exit(7)'));

    expect(result.status).toBe(7);
    expect(result.spawnError).toBeUndefined();
  });

  it('reports a zero exit as 0 with no spawn error', async () => {
    const result = await exec(NODE, script('process.exit(0)'));

    expect(result).toMatchObject({ status: 0, stdout: '', stderr: '' });
    expect(result.spawnError).toBeUndefined();
  });

  it('keeps stdout and stderr apart and verbatim', async () => {
    const result = await exec(NODE, script('process.stdout.write("out-line\\n"); process.stderr.write("err-line\\n")'));

    expect(result.stdout).toBe('out-line\n');
    expect(result.stderr).toBe('err-line\n');
  });

  it('decodes multi-byte output as UTF-8 rather than mojibake', async () => {
    // A reporter renders findings verbatim, and a check's own `✓`/`❌` is multi-byte.
    const result = await exec(NODE, script('process.stdout.write("✓ ünïcode ❌")'));

    expect(result.stdout).toBe('✓ ünïcode ❌');
  });

  it('writes `input` to the child stdin and closes it', async () => {
    const echo = 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write("["+s+"]"))';
    const result = await exec(NODE, script(echo), { input: 'fed through stdin' });

    expect(result.stdout).toBe('[fed through stdin]');
  });

  /**
   * A child that reads stdin until EOF must get an EOF even when there is nothing to
   * send. Left open, the async twin hung the child until the timeout killed it — or,
   * with no timeout, forever — while the sync twin returned at once. A tool that
   * reads piped stdin when it is not a TTY is common; the gate would just never end.
   */
  it('closes stdin when no input is given, so a child reading it sees EOF instead of hanging', async () => {
    const echo = 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write("eof["+s+"]"))';
    const result = await exec(NODE, script(echo), { timeoutSec: 3 });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('eof[]');
  });

  /**
   * A child that exits without reading its input breaks the pipe. That is the child's
   * business and its exit status says so; it must not surface as an unhandled stream
   * error in the HOST, which takes the whole run down with it.
   */
  it('survives a child that exits without reading the input it was given', async () => {
    const result = await exec(NODE, script('process.exit(3)'), { input: 'x'.repeat(8 * 1024 * 1024) });

    expect(result.status).toBe(3);
    expect(result.spawnError).toBeUndefined();
  });

  it('runs in the given cwd', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spw-proc-'));
    try {
      const result = await exec(NODE, script('process.stdout.write(process.cwd())'), { cwd: dir });

      expect(realpathSync(result.stdout)).toBe(realpathSync(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A command check run from `src/` ran THERE, while its `paths` were verified against
  // the repository root — one directory checked, another used.
  it('runs in the directory it was built with when the caller names none, and in the named one over it', async () => {
    const home = mkdtempSync(join(tmpdir(), 'spw-proc-home-'));
    const named = mkdtempSync(join(tmpdir(), 'spw-proc-named-'));
    try {
      const rooted = new ChildProcessRunner(home);
      const via = (options?: IProcessOptions) =>
        exec === TWINS[0].exec
          ? Promise.resolve(rooted.run(NODE, script('process.stdout.write(process.cwd())'), options))
          : rooted.runAsync(NODE, script('process.stdout.write(process.cwd())'), options);

      expect(realpathSync((await via()).stdout)).toBe(realpathSync(home));
      expect(realpathSync((await via({ cwd: named })).stdout)).toBe(realpathSync(named));
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(named, { recursive: true, force: true });
    }
  });

  describe('the environment', () => {
    beforeEach(() => {
      process.env.SPW_PARENT_ONLY = 'from-parent';
    });
    afterEach(() => {
      delete process.env.SPW_PARENT_ONLY;
    });

    const printEnv = script(
      'process.stdout.write(JSON.stringify({ p: process.env.SPW_PARENT_ONLY ?? null, x: process.env.SPW_EXTRA ?? null, path: Boolean(process.env.PATH || process.env.Path) }))',
    );

    it('inherits the parent environment when none is given', async () => {
      const result = await exec(NODE, printEnv);

      expect(JSON.parse(result.stdout)).toEqual({ p: 'from-parent', x: null, path: true });
    });

    /**
     * `env` is EXTRA environment, merged over the parent's — a check that sets one flag
     * must not lose PATH and fail to find every tool it shells out to.
     */
    it('merges the given env OVER the parent environment rather than replacing it', async () => {
      const result = await exec(NODE, printEnv, { env: { SPW_EXTRA: 'added', SPW_PARENT_ONLY: 'overridden' } });

      expect(JSON.parse(result.stdout)).toEqual({ p: 'overridden', x: 'added', path: true });
    });
  });

  /**
   * A killed child is a child that RAN. Reporting it as a start failure sends the reader
   * to debug a shell that is installed and working — `CommandCheck` renders a
   * spawnError as "could not start the shell". The port reserves `spawnError` for "never
   * started", and a timeout is "started, then killed": status null, no spawn error.
   */
  it('kills a child that outlives its timeout, reported as killed — not as a failure to start', async () => {
    const started = Date.now();
    const result = await exec(NODE, script('setTimeout(() => {}, 60000)'), { timeoutSec: 0.5 });

    expect(Date.now() - started).toBeLessThan(20000);
    expect(result.status).toBeNull();
    expect(result.spawnError).toBeUndefined();
  });

  /**
   * The distinction the port exists to carry: a binary that is not there never ran. Its
   * status is null, exactly like a killed child's, so `spawnError` is the ONLY field
   * that tells the two apart.
   */
  it('reports a command that does not exist as a spawn error, not as an exit status', async () => {
    const result = await exec('specwarden-no-such-binary-9f3c', ['--version']);

    expect(result.status).toBeNull();
    expect(result.spawnError).toMatch(/ENOENT/);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('reports a missing command under a deadline at once, as a spawn error — not after the deadline', async () => {
    // The deadline belongs to a child that started. A start failure must not wait it
    // out, nor be reported as the timeout it never reached.
    const started = Date.now();
    const result = await exec('specwarden-no-such-binary-9f3c', [], { timeoutSec: 30 });

    expect(result.spawnError).toMatch(/ENOENT/);
    expect(Date.now() - started).toBeLessThan(10000);
  });

  it('still reports a missing command as a spawn error when it was handed input', async () => {
    const result = await exec('specwarden-no-such-binary-9f3c', [], { input: 'unread' });

    expect(result.status).toBeNull();
    expect(result.spawnError).toMatch(/ENOENT/);
  });
});

describe('ChildProcessRunner.runAsync', () => {
  /**
   * The reason the twin exists. A rendezvous rather than a stopwatch: the waiter exits 0
   * only once a marker appears that ONLY the second child writes, so a serialised
   * runner cannot pass — the waiter would sit out its timeout and report killed — and
   * a slow machine cannot fail it.
   */
  it('does not block: a second child runs while the first is still alive', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spw-proc-'));
    const marker = JSON.stringify(join(dir, 'marker'));
    try {
      const waiter = runner.runAsync(
        NODE,
        script(
          `const fs=require('fs');const t=setInterval(()=>{if(fs.existsSync(${marker})){clearInterval(t);process.exit(0)}},20)`,
        ),
        { timeoutSec: 15 },
      );
      const writer = runner.runAsync(NODE, script(`require('fs').writeFileSync(${marker}, 'x')`));
      const [a, b] = await Promise.all([waiter, writer]);

      expect(b.status).toBe(0);
      expect(a.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
