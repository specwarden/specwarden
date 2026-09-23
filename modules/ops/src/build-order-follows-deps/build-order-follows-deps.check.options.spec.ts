import { describe, expect, it } from 'vitest';

import { CheckOptionsError } from 'specwarden';
import { buildOrderFollowsDeps } from './build-order-follows-deps.check';

const OPTIONS = {
  id: 'workspace-build-order',
  title: 't',
  packagesDir: 'packages',
  scopePrefix: '@org/',
  containerFiles: '*Dockerfile*',
  buildInvocation: String.raw`--filter\s+(@org\/[a-z0-9-]+)\s+run\s+build`,
};

describe('buildOrderFollowsDeps — its options', () => {
  it('runs without a `when`, in the fast tier', () => {
    const check = buildOrderFollowsDeps(OPTIONS);

    expect(check.when(['anything'])).toBe(true);
    expect(check.tier).toBe('fast');
  });

  it('refuses a missing option by name, and a RegExp where a source string belongs', () => {
    const { scopePrefix: _omitted, ...rest } = OPTIONS;

    expect(() => buildOrderFollowsDeps(rest as never)).toThrow(CheckOptionsError);
    expect(() => buildOrderFollowsDeps(rest as never)).toThrow('`scopePrefix` is required');
    expect(() => buildOrderFollowsDeps({ ...OPTIONS, buildInvocation: /x/ } as never)).toThrow(
      '`buildInvocation` must be a string',
    );
  });
});
