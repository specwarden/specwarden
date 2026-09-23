import { describe, expect, it } from 'vitest';

import { computeLifecycle, isForwardTransition } from './plan-lifecycle.model';

describe('computeLifecycle', () => {
  it('is archived whenever the plan lives under the archive tree, whatever it declares', () => {
    expect(computeLifecycle({ status: 'active', branchExists: true, inArchive: true })).toBe('archived');
    expect(computeLifecycle({ status: 'draft', inArchive: true })).toBe('archived');
  });

  it('is draft for a declared draft', () => {
    expect(computeLifecycle({ status: 'draft', inArchive: false })).toBe('draft');
  });

  it('is active while an active plan’s branch still resolves', () => {
    expect(computeLifecycle({ status: 'active', branchExists: true, inArchive: false })).toBe('active');
  });

  it('is spent when an active plan’s branch is provably gone', () => {
    expect(computeLifecycle({ status: 'active', branchExists: false, inArchive: false })).toBe('spent');
  });

  it('is spent when the plan declares itself done — it read as a draft', () => {
    expect(computeLifecycle({ status: 'done', branchExists: true, inArchive: false })).toBe('spent');
    expect(computeLifecycle({ status: 'done', inArchive: true })).toBe('archived');
  });

  it('does not guess spent when the checkout cannot tell', () => {
    expect(computeLifecycle({ status: 'active', branchExists: undefined, inArchive: false })).toBe('active');
  });
});

describe('isForwardTransition', () => {
  it('allows moving down the chain and rejects going back or standing still', () => {
    expect(isForwardTransition('draft', 'active')).toBe(true);
    expect(isForwardTransition('active', 'archived')).toBe(true);
    expect(isForwardTransition('spent', 'active')).toBe(false);
    expect(isForwardTransition('active', 'active')).toBe(false);
  });
});
