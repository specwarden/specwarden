import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allocate } from '../src/index.ts';

test('shares sum back to the amount — no cent is created or lost', () => {
  assert.deepEqual(allocate(100, 3), [34, 33, 33]);
  assert.equal(allocate(100, 3).reduce((a, b) => a + b), 100);
});
