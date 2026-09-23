import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refusal } from '../src/magic-link.ts';

test('a fresh, unused link signs somebody in', () => {
  assert.equal(refusal(0, false, 60_000), undefined);
});

test('a reused link is refused, with the reason', () => {
  assert.equal(refusal(0, true, 60_000), 'this link has already been used');
});

test('a link older than fifteen minutes is refused', () => {
  assert.equal(refusal(0, false, 16 * 60 * 1000), 'this link is older than fifteen minutes');
});
