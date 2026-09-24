import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The bin shim is build-free and runs before anything is compiled, so it is not imported
// here; this pins the helper its refusal is built from (core/scripts/node-floor.mjs),
// against the exact `engines.node` string the scaffolder writes into this package.
import { floorOf, isBelow, refusal } from '../../scripts/node-floor.mjs';

const declared = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).engines.node;

describe('the Node floor the CLI refuses beneath', () => {
  it('reads the floor this package declares, all three numbers of it', () => {
    // A floor it could not read would switch the refusal off in silence.
    expect(declared).toBe('>=18.18.0');
    expect(floorOf(declared)).toEqual([18, 18, 0]);
  });

  it.each([
    ['18.0.0', true],
    ['18.9.0', true],
    ['18.17.9', true],
    ['18.18.0', false],
    ['18.20.8', false],
    ['20.0.0', false],
    ['24.9.0', false],
  ])('%s is below it: %s — by number, never by string or by major', (running, below) => {
    expect(isBelow(running, [18, 18, 0])).toBe(below);
  });

  it('reads a floor written short, and names none when the range names none', () => {
    expect(floorOf('>=24')).toEqual([24, 0, 0]);
    expect(floorOf('*')).toBeUndefined();
    expect(floorOf(undefined)).toBeUndefined();
  });

  it('says the floor in full, what is running, and what to do — nothing about files the consumer may not have', () => {
    const text = refusal([18, 18, 0], '18.12.1');
    expect(text).toBe(
      'specwarden: needs node >= 18.18.0, and this shell runs 18.12.1.\n' +
        '  switch it to node 18.18.0 or newer and run the command again.\n',
    );
    expect(text).not.toMatch(/nvmrc/);
  });
});
