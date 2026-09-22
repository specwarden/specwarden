import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheck, type ICheckResult, type IReporter, type IVerdict } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { CheckRegistry } from '../../container';
import type { IWardenConfig } from '../../config/config.model';
import type { IParsedArgs } from '../_shared/parse-args/parse-args.util';
import { check } from './check.command';

/**
 * These prove the two SOCKETS, not the runner: a consumer can put its own adapter or
 * its own reporter in, and the engine actually uses it.
 *
 * The distinction matters because both were declared long before they were wired —
 * the ports were published as interfaces while the implementations stayed welded into
 * this file, so a consumer could describe a different world and never run in one. A
 * socket nothing exercises is indistinguishable from no socket at all.
 */

const args = (over: Partial<IParsedArgs> = {}): IParsedArgs => ({
  command: 'check',
  ids: [],
  all: true,
  list: false,
  json: false,
  fix: false,
  tighten: false,
  ifRelevant: false,
  relevance: false,
  ...over,
});

const io = () => {
  let out = '';
  return { io: { out: (t: string) => (out += t), err: () => {} }, read: () => out };
};

/** A check that reports what the file port handed it, so a swapped port is visible. */
function readingCheck(path: string): ICheck {
  return {
    id: 'reads-a-file',
    title: 'reads a file',
    tier: 'fast',
    zone: 'consumer',
    capabilities: ['read'],
    contractVersion: CHECK_CONTRACT_VERSION,
    when: () => true,
    run: (ctx): IVerdict => {
      const body = ctx.files.tryRead(path);
      return body === undefined
        ? { ok: false, findings: [{ severity: 'error', message: `no ${path}` }] }
        : { ok: true, findings: [{ severity: 'info', message: `saw: ${body}` }] };
    },
  };
}

const registryOf = (checks: readonly ICheck[]) => {
  const r = new CheckRegistry();
  r.registerAll(checks);
  return r;
};

const base: IWardenConfig = { checks: [] };

describe('config.adapters replaces a port', () => {
  it('hands the check the supplied file source instead of the real disk', async () => {
    const files = new InMemoryFileSource({ 'only-here.txt': 'from memory' });
    const cap = io();

    const code = await check(
      args(),
      { ...base, adapters: () => ({ files }) },
      registryOf([readingCheck('only-here.txt')]),
      '/nonexistent-root',
      {},
      cap.io,
    );

    expect(code).toBe(0);
    expect(cap.read()).toContain('saw: from memory');
  });

  it('keeps every port the consumer did NOT name', async () => {
    // The whole point of spreading over the defaults: overriding one port must not
    // oblige a caller to construct the other five, and must not leave them undefined.
    const seen: string[] = [];
    const probe: ICheck = {
      ...readingCheck('x'),
      id: 'probe',
      capabilities: ['read'],
      run: (ctx): IVerdict => {
        for (const port of ['files', 'vcs', 'proc', 'clock'] as const) {
          if (ctx[port as 'files'] !== undefined) seen.push(port);
        }
        return { ok: true, findings: [] };
      },
    };

    await check(args(), { ...base, adapters: () => ({ files: new InMemoryFileSource() }) }, registryOf([probe]), process.cwd(), {}, io().io);
    expect(seen).toContain('clock');
    expect(seen).toContain('vcs');
  });

  it('receives the resolved repository root, which a custom adapter cannot work out itself', async () => {
    let given: string | undefined;
    await check(
      args(),
      { ...base, adapters: (_d, ctx) => { given = ctx.root; return {}; } },
      registryOf([]),
      '/some/root',
      {},
      io().io,
    );
    expect(given).toBe('/some/root');
  });
});

describe('config.reporter replaces the output', () => {
  it('is used in place of both built-ins', async () => {
    const lines: string[] = [];
    const custom: IReporter = {
      checkStarted: (m) => lines.push(`start:${m.id}`),
      checkFinished: (r: ICheckResult) => lines.push(`done:${r.meta.id}:${r.verdict.ok}`),
      runFinished: () => lines.push('end'),
    };
    const cap = io();

    await check(
      args(),
      { ...base, adapters: () => ({ files: new InMemoryFileSource({ 'f.txt': 'hi' }) }), reporter: () => custom },
      registryOf([readingCheck('f.txt')]),
      process.cwd(),
      {},
      cap.io,
    );

    expect(lines).toEqual(['start:reads-a-file', 'done:reads-a-file:true', 'end']);
    // No VERDICT reached the built-in renderers — either would have named the check.
    // The run's own "full run" note is not the reporter's output and still appears.
    expect(cap.read()).not.toContain('reads-a-file');
  });

  it('is told which built-in it replaced, so it can honour --json or ignore it', async () => {
    const saw: boolean[] = [];
    const quiet: IReporter = { checkStarted: () => {}, checkFinished: () => {}, runFinished: () => {} };
    for (const json of [true, false]) {
      await check(
        args({ json }),
        { ...base, reporter: (ctx) => { saw.push(ctx.json); return quiet; } },
        registryOf([]),
        process.cwd(),
        {},
        io().io,
      );
    }
    expect(saw).toEqual([true, false]);
  });
});
