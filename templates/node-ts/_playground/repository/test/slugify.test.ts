import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SlugError, slugify } from '../src/index.ts';

test('joins words with single hyphens and drops the punctuation', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
});

test('folds accents rather than dropping the letter', () => {
  assert.equal(slugify('Crème brûlée'), 'creme-brulee');
});

test('refuses a title with nothing left, instead of returning an empty slug', () => {
  assert.throws(() => slugify('?!'), SlugError);
});
