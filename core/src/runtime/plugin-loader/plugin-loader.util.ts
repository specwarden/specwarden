import type { ICheck, IPlugin } from '../../domain';

/** The keys a plugin may carry. Anything else is refused, so a plugin cannot grow
 * an adapter slot by accident. */
const ALLOWED_KEYS = new Set(['name', 'checks']);

/** Adapter-shaped keys, refused with a message that explains the boundary rather
 * than a generic "unknown key". */
const ADAPTER_KEYS = ['files', 'vcs', 'proc', 'clock', 'writer', 'reporter', 'ratchetStore', 'adapters', 'ports'];

export class PluginContractError extends Error {
  override readonly name = 'PluginContractError';
}

export interface ILoadedPlugins {
  readonly checks: readonly ICheck[];
}

/**
 * Collect the declarations a set of plugins contributes, enforcing the contract:
 * a plugin may only declare, never supply an adapter. The checks come back in
 * plugin order for a stable manifest; duplicate ids across plugins and the config
 * are caught later, by the roster.
 */
export function loadPlugins(plugins: readonly IPlugin[]): ILoadedPlugins {
  const checks: ICheck[] = [];

  for (const plugin of plugins) {
    if (typeof plugin?.name !== 'string' || plugin.name === '') {
      throw new PluginContractError('a plugin must declare a non-empty name.');
    }
    for (const key of ADAPTER_KEYS) {
      if (key in plugin) {
        throw new PluginContractError(
          `plugin '${plugin.name}' supplies '${key}' — a plugin declares WHAT to check; the engine owns the ports (HOW). Remove it.`,
        );
      }
    }
    for (const key of Object.keys(plugin)) {
      if (!ALLOWED_KEYS.has(key)) {
        throw new PluginContractError(`plugin '${plugin.name}' has an unknown key '${key}'.`);
      }
    }
    if (plugin.checks) checks.push(...plugin.checks);
  }

  return { checks };
}
