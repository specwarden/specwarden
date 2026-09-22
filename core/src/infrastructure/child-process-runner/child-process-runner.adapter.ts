import { spawn, spawnSync } from 'node:child_process';

import type { IProcessOptions, IProcessResult, IProcessRunner } from '../../domain';

/**
 * The real subprocess adapter. Synchronous (matching the legacy guards and the
 * runner's deterministic output order) and deliberately thin: it translates the
 * port's shape to `spawnSync` and back, and owns no policy — capability gating is
 * the container's job, timeouts and env are the caller's.
 */
export class ChildProcessRunner implements IProcessRunner {
  run(command: string, args: readonly string[], options: IProcessOptions = {}): IProcessResult {
    const result = spawnSync(command, [...args], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      input: options.input,
      timeout: options.timeoutSec ? options.timeoutSec * 1000 : undefined,
      encoding: 'utf8',
    });
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      // `spawnSync` reports a failure to START here rather than through the status,
      // and the two must not be conflated — see the port.
      spawnError: result.error ? result.error.message : undefined,
    };
  }

  /**
   * The non-blocking twin, so the runner can overlap two commands.
   *
   * Same contract as `run`, including the distinction between a process that failed
   * to START and one that ran and failed — here the 'error' event carries the first
   * and 'close' the second.
   */
  runAsync(command: string, args: readonly string[], options: IProcessOptions = {}): Promise<IProcessResult> {
    return new Promise((resolve) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result: IProcessResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.stdout?.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
      child.stderr?.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
      if (options.input !== undefined) child.stdin?.end(options.input);

      const timer = options.timeoutSec ? setTimeout(() => child.kill(), options.timeoutSec * 1000) : undefined;

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        finish({ status: null, stdout, stderr, spawnError: err.message });
      });
      child.on('close', (status) => {
        if (timer) clearTimeout(timer);
        finish({ status, stdout, stderr });
      });
    });
  }
}
