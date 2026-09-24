import { describe, expect, it } from 'vitest';

import { defineConfig } from './config.model';

describe('defineConfig', () => {
  it('is the identity — it exists for the editor types, and changes nothing it is handed', () => {
    const config = { rules: [], selfChecks: false as const, jobs: 2 };
    expect(defineConfig(config)).toBe(config);
  });
});
