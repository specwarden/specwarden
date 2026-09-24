import type { IAgentRuntime, IPerimeterPolicy } from '../../../domain';

/** What `perimeter.mjs` may export: `policies` (and a `runtime`) by name, or as its
 * default — an array of policies, or an object carrying them. */
export interface IPerimeterModule {
  readonly policies?: readonly IPerimeterPolicy[];
  readonly runtime?: IAgentRuntime;
  /** The export's old name. Read only to refuse it: see `perimeterDeclaration`. */
  readonly rules?: unknown;
  readonly default?:
    { policies?: readonly IPerimeterPolicy[]; runtime?: IAgentRuntime; rules?: unknown } | readonly IPerimeterPolicy[];
}

/**
 * The policies and the runtime a perimeter module declares, in every shape it may declare
 * them.
 *
 * ONE READING, because two parties read this file: the hook, which enforces the policies,
 * and the loader, which counts their ids as enforcers so `enforcement-resolves` can
 * resolve a rule naming one. Two readings would let the hook enforce a policy the audit
 * cannot see — or the audit vouch for one the hook never loads.
 *
 * A module exporting `rules` and no `policies` is refused, naming the rename: read as
 * "no policies" it enforced nothing, in silence — the one way a guard must not fail.
 */
export function perimeterDeclaration(mod: IPerimeterModule): {
  policies: readonly IPerimeterPolicy[];
  runtime?: IAgentRuntime;
} {
  const fallback: { policies?: readonly IPerimeterPolicy[]; runtime?: IAgentRuntime; rules?: unknown } = Array.isArray(
    mod.default,
  )
    ? { policies: mod.default as readonly IPerimeterPolicy[] }
    : ((mod.default as { policies?: readonly IPerimeterPolicy[]; runtime?: IAgentRuntime } | undefined) ?? {});
  const policies = mod.policies ?? fallback.policies;
  if (policies === undefined && (mod.rules !== undefined || fallback.rules !== undefined)) {
    throw new Error(
      'perimeter.mjs exports `rules`, and the export is now `policies` — rename it; ' +
        'read under the old name it would enforce nothing.',
    );
  }
  return { policies: policies ?? [], runtime: mod.runtime ?? fallback.runtime };
}
