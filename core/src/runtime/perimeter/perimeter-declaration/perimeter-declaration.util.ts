import type { IAgentRuntime, IPerimeterRule } from '../../../domain';

/** What `perimeter.mjs` may export: `rules` (and a `runtime`) by name, or as its default —
 * an array of rules, or an object carrying them. */
export interface IPerimeterModule {
  readonly rules?: readonly IPerimeterRule[];
  readonly runtime?: IAgentRuntime;
  readonly default?: { rules?: readonly IPerimeterRule[]; runtime?: IAgentRuntime } | readonly IPerimeterRule[];
}

/**
 * The rules and the runtime a perimeter module declares, in every shape it may declare
 * them.
 *
 * ONE READING, because two parties read this file: the hook, which enforces the rules,
 * and the loader, which counts their ids as enforcers so `enforcement-resolves` can
 * resolve a rule naming one. Two readings would let the hook enforce a rule the audit
 * cannot see — or the audit vouch for one the hook never loads.
 */
export function perimeterDeclaration(mod: IPerimeterModule): {
  rules: readonly IPerimeterRule[];
  runtime?: IAgentRuntime;
} {
  const fallback: { rules?: readonly IPerimeterRule[]; runtime?: IAgentRuntime } = Array.isArray(mod.default)
    ? { rules: mod.default as readonly IPerimeterRule[] }
    : ((mod.default as { rules?: readonly IPerimeterRule[]; runtime?: IAgentRuntime } | undefined) ?? {});
  return { rules: mod.rules ?? fallback.rules ?? [], runtime: mod.runtime ?? fallback.runtime };
}
