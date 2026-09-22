import { describe, expect, it } from 'vitest';

import { CHECK_CONTRACT_VERSION, type ICheck, type IPlugin } from '../../domain';
import { PluginContractError, loadPlugins } from './plugin-loader.util';

const check = (id: string): ICheck => ({
  id,
  title: id,
  tier: 'fast',
  zone: 'consumer',
  capabilities: ['read'],
  contractVersion: CHECK_CONTRACT_VERSION,
  when: () => true,
  run: () => ({ ok: true, findings: [] }),
});

describe('loadPlugins', () => {
  it('merges checks from each plugin, in plugin order', () => {
    const a: IPlugin = { name: 'a', checks: [check('a1'), check('a2')] };
    const b: IPlugin = { name: 'b', checks: [check('b1')] };
    expect(loadPlugins([a, b]).checks.map((c) => c.id)).toEqual(['a1', 'a2', 'b1']);
  });

  it('refuses a plugin that supplies a port adapter, explaining the boundary', () => {
    const rogue = { name: 'rogue', files: { read: () => '' } } as unknown as IPlugin;
    expect(() => loadPlugins([rogue])).toThrow(PluginContractError);
    try {
      loadPlugins([rogue]);
    } catch (e) {
      expect((e as Error).message).toContain('the engine owns the ports');
    }
  });

  it('refuses an unknown key and a nameless plugin', () => {
    expect(() => loadPlugins([{ name: 'x', bogus: 1 } as unknown as IPlugin])).toThrow(PluginContractError);
    expect(() => loadPlugins([{ checks: [] } as unknown as IPlugin])).toThrow(PluginContractError);
  });
});
