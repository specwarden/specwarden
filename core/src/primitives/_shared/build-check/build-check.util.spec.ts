import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from '../../../domain';
import { testContext } from '../../../testing';
import { UNNAMED_CHECK_ID, buildCheck, nameFromFile, normaliseRule } from './build-check.util';

/**
 * What a check file may leave out, because the engine can know it. A one-line check
 * carried seven fields, three of which said anything.
 */
const pass = (): IVerdict => ({ ok: true, findings: [] });

describe('buildCheck — the defaults a check may omit', () => {
  it('defaults the tier to `fast` — a check with no tier was in no schedule at all', () => {
    expect(buildCheck({ id: 'x' }, ['read'], pass).tier).toBe('fast');
    expect(buildCheck({ id: 'x', tier: 'heavy' }, ['read'], pass).tier).toBe('heavy');
  });

  it('defaults the title to the rule’s statement, else the id — it listed as `undefined`', () => {
    expect(buildCheck({ id: 'x', rule: 'no TODO in shipped source' }, [], pass).title).toBe(
      'no TODO in shipped source',
    );
    expect(buildCheck({ id: 'x' }, [], pass).title).toBe('x');
    expect(buildCheck({ id: 'x', title: 'mine', rule: 'r' }, [], pass).title).toBe('mine');
  });

  it('reads a string rule as its statement', () => {
    expect(buildCheck({ id: 'x', rule: 'a statement' }, [], pass).rule).toEqual({ statement: 'a statement' });
    const whole = { statement: 's', owner: 'README.md' };
    expect(buildCheck({ id: 'x', rule: whole }, [], pass).rule).toBe(whole);
  });

  it('defaults the ratchet id to the check id when a `ratchet` is declared — it recorded nothing without one', () => {
    expect(buildCheck({ id: 'x', ratchet: 5 }, [], pass).ratchet).toEqual({
      id: 'x',
      direction: undefined,
      ceiling: 5,
    });
    expect(buildCheck({ id: 'x', ratchetId: 'y' }, [], pass).ratchet).toMatchObject({ id: 'y' });
    expect(buildCheck({ id: 'x' }, [], pass).ratchet).toBeUndefined();
  });

  it('carries an unusable placeholder when no id is given, for discovery or the registry to settle', () => {
    const check = buildCheck({}, [], pass);
    expect([check.id, check.title]).toEqual([UNNAMED_CHECK_ID, UNNAMED_CHECK_ID]);
    // Not in the id grammar, so no author writes it by accident.
    expect(UNNAMED_CHECK_ID).not.toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('hands the body the built check, so an id supplied later is the id its findings carry', async () => {
    const check = buildCheck({}, [], (_ctx: ICheckContext, self) => ({
      ok: false,
      findings: [{ severity: 'error', message: 'm', ruleId: self.id }],
    }));
    nameFromFile(check, { id: 'from-the-file', owner: 'x.check.mjs' });
    expect((await check.run(testContext())).findings[0].ruleId).toBe('from-the-file');
  });
});

describe('nameFromFile — only what the check left out', () => {
  it('names the id, a title that was the id, and a ratchet that was the id', () => {
    const check = nameFromFile(buildCheck({ ratchet: 2 }, [], pass), { id: 'no-todo', owner: 'f.mjs' });
    expect([check.id, check.title, check.ratchet?.id]).toEqual(['no-todo', 'no-todo', 'no-todo']);
  });

  it('keeps a title that came from the rule, and an id the author wrote', () => {
    const titled = nameFromFile(buildCheck({ rule: 's' }, [], pass), { id: 'a', owner: 'f.mjs' });
    expect(titled.title).toBe('s');
    const named = nameFromFile(buildCheck({ id: 'mine' }, [], pass), { id: 'a', owner: 'f.mjs' });
    expect(named.id).toBe('mine');
  });

  it('owns an ownerless rule by the file, a string rule included, and leaves a named owner', () => {
    expect(nameFromFile(buildCheck({ id: 'a', rule: 's' }, [], pass), { owner: 'f.mjs' }).rule).toEqual({
      statement: 's',
      owner: 'f.mjs',
    });
    const owned = { statement: 's', owner: 'README.md' };
    expect(nameFromFile(buildCheck({ id: 'a', rule: owned }, [], pass), { owner: 'f.mjs' }).rule).toBe(owned);
    expect(nameFromFile(buildCheck({ id: 'a' }, [], pass), { owner: 'f.mjs' }).rule).toBeUndefined();
  });

  it('with no id offered, an unnamed check stays unnamed — the registry refuses it', () => {
    expect(nameFromFile(buildCheck({}, [], pass), { owner: 'f.mjs' }).id).toBe(UNNAMED_CHECK_ID);
  });
});

describe('normaliseRule', () => {
  it('passes an object or nothing through', () => {
    expect(normaliseRule(undefined)).toBeUndefined();
    expect(normaliseRule('s')).toEqual({ statement: 's' });
  });
});
