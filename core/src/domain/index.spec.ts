import { describe, expect, it } from 'vitest';

import {
  CAPABILITIES,
  CHECK_CONTRACT_VERSION,
  FileNotFoundError,
  PLAN_STATUSES,
  SEVERITIES,
  TIERS,
  ZONES,
} from './index';

/**
 * The domain is interface-heavy, so most of it is checked by `tsc`, not here.
 * What a type-check cannot catch is a barrel that silently drops a VALUE export
 * (a runtime `undefined` that surfaces far away) or a change to a vocabulary the
 * rest of the engine hardcodes against. Those are what this locks.
 */
describe('domain barrel value exports', () => {
  it('re-exports every runtime value the engine imports by name', () => {
    expect(ZONES).toEqual(['product', 'consumer']);
    expect(TIERS).toEqual(['fast', 'heavy', 'nightly']);
    expect(CAPABILITIES).toEqual(['read', 'exec', 'write', 'net']);
    expect(SEVERITIES).toEqual(['error', 'warning', 'info']);
    expect(PLAN_STATUSES).toEqual(['draft', 'active', 'done']);
    expect(typeof FileNotFoundError).toBe('function');
  });

  it('states a contract version the load-gate can compare against', () => {
    expect(Number.isInteger(CHECK_CONTRACT_VERSION)).toBe(true);
    expect(CHECK_CONTRACT_VERSION).toBeGreaterThan(0);
  });
});

describe('FileNotFoundError', () => {
  it('carries the offending path and a distinguishable name', () => {
    const err = new FileNotFoundError('docs/README.md');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FileNotFoundError');
    expect(err.path).toBe('docs/README.md');
    expect(err.message).toContain('docs/README.md');
  });
});
