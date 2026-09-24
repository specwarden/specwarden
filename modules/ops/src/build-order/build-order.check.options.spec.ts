import { describe, expect, it } from 'vitest';

import { CheckOptionsError } from 'specwarden';
import { buildOrder, buildSequence } from './build-order.check';

const OPTIONS = {
  title: 't',
  packagesDir: 'packages',
  scopePrefix: '@org/',
  containerFiles: '*Dockerfile*',
  buildInvocation: /--filter\s+(@org\/[a-z0-9-]+)\s+run\s+build/,
};

describe('buildOrder — its options', () => {
  it('runs without a `when`, in the fast tier', () => {
    const check = buildOrder(OPTIONS);

    expect(check.when(['anything'])).toBe(true);
    expect(check.tier).toBe('fast');
  });

  it('is named `build-order` unless told otherwise, and carries the rule the package implies', () => {
    const check = buildOrder(OPTIONS);

    expect(check.id).toBe('build-order');
    expect(check.rule).toMatchObject({ owner: '@specwarden/ops', implied: true });
  });

  it('refuses a missing option by name, and a source string where a RegExp belongs', () => {
    const { scopePrefix: _omitted, ...rest } = OPTIONS;

    expect(() => buildOrder(rest as never)).toThrow(CheckOptionsError);
    expect(() => buildOrder(rest as never)).toThrow('`scopePrefix` is required');
    expect(() => buildOrder({ ...OPTIONS, buildInvocation: 'run build (\\S+)' } as never)).toThrow(
      '`buildInvocation` must be a RegExp',
    );
    expect(() => buildOrder({ ...OPTIONS, containerFiles: '' })).toThrow('`containerFiles` is empty');
  });
});

describe('buildOrder — a pattern written with `g`', () => {
  it('reads the same builds as one written without it', () => {
    const text = 'RUN pnpm --filter @org/i18n run build\nRUN pnpm --filter @org/contracts run build\n';

    expect(buildSequence(text, /--filter\s+(@org\/[a-z0-9-]+)\s+run\s+build/g)).toEqual([
      '@org/i18n',
      '@org/contracts',
    ]);
  });
});
