import type {
  ICheckContext,
  ICheckMeta,
  IClock,
  IFileSource,
  IFileWriter,
  IProcessRunner,
  IRatchetStore,
  IVcs,
  TCapability,
} from '../../../domain';
import { CapabilityError } from '../capability-error/capability-error.error';

/** The real adapters the engine holds; a check receives a capability-gated view. */
export interface IEngineAdapters {
  readonly files: IFileSource;
  readonly vcs: IVcs;
  readonly proc: IProcessRunner;
  readonly clock: IClock;
  readonly writer: IFileWriter;
  /** Persistence for ratchet thresholds; the runner reads and (under --tighten)
   * lowers them. Not exposed to checks — they receive only their value via ctx. */
  readonly ratchets: IRatchetStore;
}

/**
 * Wrap a port so that, unless the capability was granted, every method call
 * throws `CapabilityError`. Property ACCESS stays cheap (returns a thunk); the
 * throw is on invocation, which is where the undeclared use actually happens, and
 * keeps `'method' in port` style probes from throwing spuriously.
 */
function gate<T extends object>(checkId: string, needed: TCapability, real: T, granted: boolean): T {
  if (granted) return real;
  return new Proxy(real, {
    get(_target, prop) {
      return () => {
        throw new CapabilityError(checkId, needed, String(prop));
      };
    },
  }) as T;
}

/**
 * Build the context a check runs against, restricted to what it declared. Two
 * ports read the world (`files`, `vcs`) and are gated on `read`; one runs a
 * subprocess (`proc`) and is gated on `exec`; the `writer` port is gated on `write`.
 * The clock is ungated — time is harmless and always available. `net` has no port
 * yet; when it gains one, it is gated here and nowhere else.
 */
export function buildContext(
  check: ICheckMeta,
  adapters: IEngineAdapters,
  changed: readonly string[],
  shard?: string,
  ratchet?: number,
  // The manifest, read lazily; defaults to "just me" so a context built for one
  // check in isolation (a test, a REPL) still answers rather than throwing.
  roster: () => readonly ICheckMeta[] = () => [check],
): ICheckContext {
  const caps = new Set<TCapability>(check.capabilities);
  return {
    changed,
    shard,
    ratchet,
    roster,
    files: gate(check.id, 'read', adapters.files, caps.has('read')),
    vcs: gate(check.id, 'read', adapters.vcs, caps.has('read')),
    proc: gate(check.id, 'exec', adapters.proc, caps.has('exec')),
    clock: adapters.clock,
    writer: gate(check.id, 'write', adapters.writer, caps.has('write')),
  };
}
