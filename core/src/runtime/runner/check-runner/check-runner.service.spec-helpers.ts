/**
 * The fixtures every CheckRunner suite is built from.
 *
 * They live beside the suites rather than inside one of them because three files now
 * share them, and a fixture copied into a second suite is how two suites start
 * testing subtly different runners while both stay green.
 */

import {
  CHECK_CONTRACT_VERSION,
  type ICheck,
  type IReporter,
  type IVcs,
  type IVerdict,
  type TRatchetDirection,
  tightenedTo,
} from '../../../domain';
import { InMemoryFileSource, SystemClock } from '../../../infrastructure';
import type { IEngineAdapters } from '../../container';
import { CheckRegistry } from '../../container/check-registry/check-registry.service';

export function vcsWith(changed: readonly string[] | undefined, lines?: number): IVcs {
  return {
    refExists: () => true,
    remoteBranches: () => [],
    branchNames: () => [],
    currentBranch: () => undefined,
    changedFiles: () => changed,
    changedLineCount: () => lines,
    trackedFiles: () => [],
  };
}

export function adapters(changed: readonly string[] | undefined, lines?: number): IEngineAdapters {
  return {
    files: new InMemoryFileSource(),
    vcs: vcsWith(changed, lines),
    proc: { run: () => ({ status: 0, stdout: '', stderr: '' }) },
    clock: new SystemClock(),
    writer: { write: () => {} },
    ratchets: ratchetStore,
  };
}

/** A mutable in-memory ratchet store for the runner tests. */
export const ratchetBacking = new Map<string, number>();
export const ratchetStore = {
  read: (id: string) => (ratchetBacking.has(id) ? { id, value: ratchetBacking.get(id) as number } : undefined),
  establish: (id: string, value: number) => {
    ratchetBacking.set(id, value);
    return { id, value };
  },
  tighten: (id: string, value: number, direction?: TRatchetDirection) => {
    const next = tightenedTo(ratchetBacking.get(id) ?? value, value, direction);
    ratchetBacking.set(id, next);
    return { id, value: next };
  },
};

export function recordingReporter(): { reporter: IReporter; ran: string[] } {
  const ran: string[] = [];
  const reporter: IReporter = {
    checkStarted: (m) => ran.push(m.id),
    checkFinished: () => {},
    runFinished: () => {},
  };
  return { reporter, ran };
}

let seq = 0;
export function check(over: Partial<ICheck> & { verdict?: IVerdict } = {}): ICheck {
  const verdict = over.verdict ?? { ok: true, findings: [] };
  return {
    id: over.id ?? `c${seq++}`,
    title: over.title ?? 'c',
    tier: over.tier ?? 'fast',
    zone: 'consumer',
    capabilities: over.capabilities ?? [],
    contractVersion: CHECK_CONTRACT_VERSION,
    advisory: over.advisory,
    when: over.when ?? (() => true),
    run: over.run ?? (() => verdict),
  };
}

export function registryOf(checks: readonly ICheck[]): CheckRegistry {
  const reg = new CheckRegistry();
  reg.registerAll(checks);
  return reg;
}
