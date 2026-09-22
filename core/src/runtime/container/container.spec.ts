import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheck, type ICheckMeta, type IVcs, type TCapability } from '../../domain';
import { InMemoryFileSource, SystemClock } from '../../infrastructure';
import {
  CapabilityError,
  CheckContractVersionError,
  CheckRegistry,
  DuplicateCheckError,
  type IEngineAdapters,
  buildContext,
} from './index';

const NOOP_VCS: IVcs = {
  refExists: () => true,
  remoteBranches: () => [],
  branchNames: () => [],
  currentBranch: () => undefined,
  changedFiles: () => [],
  changedLineCount: () => 0,
  trackedFiles: () => [],
};

function adapters(): IEngineAdapters {
  return {
    files: new InMemoryFileSource({ 'a.txt': 'hi' }),
    vcs: NOOP_VCS,
    proc: { run: () => ({ status: 0, stdout: 'ok', stderr: '' }) },
    clock: new SystemClock(),
    writer: { write: () => {} },
    ratchets: { read: () => undefined, establish: (id, value) => ({ id, value }), tighten: (id, value) => ({ id, value }) },
  };
}

function meta(id: string, capabilities: readonly TCapability[]): ICheckMeta {
  return { id, title: id, tier: 'fast', zone: 'consumer', capabilities, contractVersion: CHECK_CONTRACT_VERSION };
}

function check(overrides: Partial<ICheck> = {}): ICheck {
  return {
    id: 'c',
    title: 'c',
    tier: 'fast',
    zone: 'consumer',
    capabilities: ['read'],
    contractVersion: CHECK_CONTRACT_VERSION,
    when: () => true,
    run: () => ({ ok: true, findings: [] }),
    ...overrides,
  };
}

describe('capability gating — the engine denies what a check did not declare', () => {
  it('a read-only check may read files but not spawn', () => {
    const ctx = buildContext(meta('reader', ['read']), adapters(), []);
    expect(ctx.files.read('a.txt')).toBe('hi');
    expect(ctx.vcs.refExists('HEAD')).toBe(true);
    expect(() => ctx.proc.run('git', ['status'])).toThrow(CapabilityError);
  });

  it('an exec-only check may spawn but not read the world', () => {
    const ctx = buildContext(meta('runner', ['exec']), adapters(), []);
    expect(ctx.proc.run('echo', ['x']).stdout).toBe('ok');
    expect(() => ctx.files.read('a.txt')).toThrow(CapabilityError);
    expect(() => ctx.vcs.refExists('HEAD')).toThrow(CapabilityError);
  });

  it('the error names the check, the missing capability and the member called', () => {
    const ctx = buildContext(meta('reader', ['read']), adapters(), []);
    try {
      ctx.proc.run('git', []);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CapabilityError);
      const e = err as CapabilityError;
      expect(e.checkId).toBe('reader');
      expect(e.needed).toBe('exec');
      expect(e.member).toBe('run');
    }
  });

  it('the clock is always available, ungated', () => {
    const ctx = buildContext(meta('reader', ['read']), adapters(), []);
    expect(ctx.clock.now()).toBeInstanceOf(Date);
  });

  it('gates the writer on write: a non-write check may not write, a write check may', () => {
    expect(() => buildContext(meta('reader', ['read']), adapters(), []).writer.write('x', 'y')).toThrow(CapabilityError);
    expect(() => buildContext(meta('scribe', ['write']), adapters(), []).writer.write('x', 'y')).not.toThrow();
  });
});

describe('CheckRegistry — validated at registration', () => {
  it('accepts a check on the current contract and lists it', () => {
    const reg = new CheckRegistry();
    reg.register(check({ id: 'ok-check' }));
    expect(reg.all().map((c) => c.id)).toEqual(['ok-check']);
    expect(reg.byId('ok-check')?.id).toBe('ok-check');
  });

  it('refuses a check built against an incompatible contract major', () => {
    const reg = new CheckRegistry();
    expect(() => reg.register(check({ id: 'future', contractVersion: CHECK_CONTRACT_VERSION + 1 }))).toThrow(
      CheckContractVersionError,
    );
  });

  it('refuses a duplicate id', () => {
    const reg = new CheckRegistry();
    reg.register(check({ id: 'dup' }));
    expect(() => reg.register(check({ id: 'dup' }))).toThrow(DuplicateCheckError);
  });

  it('preserves registration order and filters by tier', () => {
    const reg = new CheckRegistry();
    reg.register(check({ id: 'a', tier: 'fast' }));
    reg.register(check({ id: 'b', tier: 'heavy' }));
    reg.register(check({ id: 'c', tier: 'fast' }));
    expect(reg.all().map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(reg.forTier('fast').map((c) => c.id)).toEqual(['a', 'c']);
  });
});
