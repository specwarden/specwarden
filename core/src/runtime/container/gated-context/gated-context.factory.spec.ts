import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheckMeta, type IVcs, type TCapability } from '../../../domain';
import { InMemoryFileSource } from '../../../infrastructure';
import { CapabilityError } from '../capability-error/capability-error.error';
import { type IEngineAdapters, buildContext } from './gated-context.factory';

/**
 * The context a check runs against, cut down to what it declared. The container suite
 * pins the headline refusals; this one pins what the gate must NOT do — throw on a
 * probe, hand out a wrapper where the real port was granted, or lose the per-run facts
 * (changed set, shard, ratchet, roster) a check reads alongside the ports.
 */
const VCS: IVcs = {
  refExists: () => true,
  remoteBranches: () => ['dev'],
  branchNames: () => ['dev'],
  currentBranch: () => 'dev',
  changedFiles: () => [],
  changedLineCount: () => 0,
  trackedFiles: () => ['a.txt'],
};

function adapters(): IEngineAdapters {
  return {
    files: new InMemoryFileSource({ 'a.txt': 'hi' }),
    vcs: VCS,
    proc: { run: () => ({ status: 0, stdout: 'ran', stderr: '' }) },
    clock: { now: () => new Date(0), monotonicMs: () => 1 },
    writer: { write: () => {} },
    ratchets: {
      read: () => undefined,
      establish: (id, value) => ({ id, value }),
      tighten: (id, value) => ({ id, value }),
    },
  };
}

const meta = (id: string, capabilities: readonly TCapability[]): ICheckMeta => ({
  id,
  title: id,
  tier: 'fast',
  zone: 'consumer',
  capabilities,
  contractVersion: CHECK_CONTRACT_VERSION,
});

describe('buildContext', () => {
  /**
   * A granted port is the adapter itself. A wrapper around a granted port would be a
   * second implementation of every method, and the first one it got wrong would be a
   * check behaving differently under the engine than under its own test.
   */
  it('hands out the REAL adapter for a granted capability, not a wrapper', () => {
    const a = adapters();
    const ctx = buildContext(meta('all', ['read', 'exec', 'write']), a, []);

    expect(ctx.files).toBe(a.files);
    expect(ctx.vcs).toBe(a.vcs);
    expect(ctx.proc).toBe(a.proc);
    expect(ctx.writer).toBe(a.writer);
    expect(ctx.clock).toBe(a.clock);
  });

  it('gates vcs on read, as it reads the world just as files does', () => {
    const ctx = buildContext(meta('runner', ['exec']), adapters(), []);

    expect(() => ctx.vcs.trackedFiles()).toThrow(CapabilityError);
    expect(() => ctx.vcs.currentBranch()).toThrow(/used a 'read' capability/);
  });

  it('grants nothing for `net` — it has no port, so declaring it unlocks no other one', () => {
    const ctx = buildContext(meta('net-only', ['net']), adapters(), []);

    expect(() => ctx.files.read('a.txt')).toThrow(CapabilityError);
    expect(() => ctx.proc.run('x', [])).toThrow(CapabilityError);
    expect(() => ctx.writer.write('x', 'y')).toThrow(CapabilityError);
  });

  it('a check that declared nothing still has the clock, and nothing else', () => {
    const ctx = buildContext(meta('pure', []), adapters(), []);

    expect(ctx.clock.monotonicMs()).toBe(1);
    expect(() => ctx.files.exists('a.txt')).toThrow(CapabilityError);
  });

  /**
   * The throw is on the CALL. Reaching a member — to pass it along, or to probe it —
   * is not a use of the power, and a gate that threw on access would break a check
   * that merely feature-tests its port before deciding not to use it.
   */
  it('does not throw on property access or an `in` probe — only on invocation', () => {
    const ctx = buildContext(meta('reader', ['read']), adapters(), []);

    const member = ctx.proc.run;
    expect(typeof member).toBe('function');
    expect('run' in ctx.proc).toBe(true);
    expect(() => member('x', [])).toThrow(CapabilityError);
  });

  it('names the member that was actually called in the refusal', () => {
    const ctx = buildContext(meta('reader', ['read']), adapters(), []);

    try {
      ctx.writer.write('out.txt', 'x');
      expect.unreachable('a non-write check wrote');
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityError);
      expect(error).toMatchObject({ checkId: 'reader', needed: 'write', member: 'write' });
    }
  });

  it('carries the changed set, the shard and the stored ratchet through unchanged', () => {
    const ctx = buildContext(meta('c', ['read']), adapters(), ['a.ts', 'b.ts'], '2/4', 9);

    expect(ctx.changed).toEqual(['a.ts', 'b.ts']);
    expect(ctx.shard).toBe('2/4');
    expect(ctx.ratchet).toBe(9);
  });

  it('leaves shard and ratchet undefined when the run supplies none', () => {
    const ctx = buildContext(meta('c', ['read']), adapters(), []);

    expect(ctx.shard).toBeUndefined();
    expect(ctx.ratchet).toBeUndefined();
  });

  /**
   * Built for one check in isolation — a test, a REPL — the roster is that check. An
   * empty roster would make a check that audits the roster (an orphan audit, a
   * coverage audit) report on a manifest with nothing in it, which is a pass.
   */
  it('answers a roster of just this check when none is supplied', () => {
    const self = meta('solo', ['read']);

    expect(buildContext(self, adapters(), []).roster()).toEqual([self]);
  });

  it('reads the supplied roster lazily, so a check sees the manifest as it stands at run time', () => {
    const manifest: ICheckMeta[] = [meta('a', [])];
    const ctx = buildContext(meta('a', []), adapters(), [], undefined, undefined, () => manifest);
    manifest.push(meta('b', []));

    expect(ctx.roster().map((m) => m.id)).toEqual(['a', 'b']);
  });
});
