import { describe, expect, it } from 'vitest';

import { isFixable } from '../../domain';
import { errorsOf, testContext } from '../../testing';
import { regenerable } from './regenerable.primitive';

const ID = { id: 'map', title: 'the map matches its generator', tier: 'fast' as const };

const check = (over: Record<string, unknown> = {}) =>
  regenerable({ ...ID, artifact: 'docs/map.md', by: 'generate-map', ...over });

const producing = (stdout: string, status = 0) => ({
  tree: { 'docs/map.md': 'committed' },
  exec: () => ({ status, stdout, stderr: '' }),
});

describe('regenerable', () => {
  it('passes when the artifact matches what the generator prints', async () => {
    const verdict = await check().run(testContext(producing('committed')));

    expect(verdict.ok).toBe(true);
  });

  it('fails when the artifact has drifted from the generator', async () => {
    const verdict = await check().run(testContext(producing('regenerated')));

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toContain('does not match');
  });

  it('fails when the generator itself fails, without claiming the artifact is stale', async () => {
    const verdict = await check().run(testContext(producing('', 3)));

    expect(errorsOf(verdict)[0]).toContain('failed (exit 3)');
    expect(errorsOf(verdict)[0]).not.toContain('does not match');
  });

  it('fails when the artifact is absent', async () => {
    const verdict = await check().run(testContext({ tree: {}, exec: () => ({ status: 0, stdout: 'x', stderr: '' }) }));

    expect(errorsOf(verdict)[0]).toContain('does not exist');
  });

  it('hands the generator its own deadline, so a hung one does not hang the run', () => {
    const ctx = testContext({
      ...producing('committed'),
      exec: () => ({ status: 0, stdout: 'committed', stderr: '' }),
    });
    let seen: unknown;
    const spy = {
      ...ctx,
      proc: {
        run: (c: string, a: readonly string[], o?: unknown) => (
          (seen = o),
          { status: 0, stdout: 'committed', stderr: '' }
        ),
      },
    };

    check({ timeoutSec: 30 }).run(spy as never);

    expect(seen).toMatchObject({ timeoutSec: 30 });
  });

  // ── the repair ─────────────────────────────────────────────────────────────────

  it('offers no repair unless the consumer asked for one', () => {
    expect(isFixable(check())).toBe(false);
    expect(check().capabilities).toEqual(['read', 'exec']);
  });

  it('declares `write` exactly when it offers the repair', () => {
    // A capability that appears without being asked for is a manifest nobody can
    // trust; one that is missing turns a working repair into a port that throws.
    expect(check({ fixable: true }).capabilities).toEqual(['read', 'exec', 'write']);
    expect(isFixable(check({ fixable: true }))).toBe(true);
  });

  it('writes the generator’s output over the artifact', async () => {
    const fixable = check({ fixable: true });
    const ctx = testContext(producing('regenerated'));

    const outcome = await (fixable as { fix: (c: typeof ctx) => Promise<{ fixed: number }> }).fix(ctx);

    expect(outcome.fixed).toBe(1);
    expect(ctx.writes.get('docs/map.md')).toBe('regenerated');
  });

  it('writes nothing when the artifact is already current', async () => {
    const fixable = check({ fixable: true });
    const ctx = testContext(producing('committed'));

    const outcome = await (fixable as { fix: (c: typeof ctx) => Promise<{ fixed: number }> }).fix(ctx);

    expect(outcome.fixed).toBe(0);
    expect(ctx.writes.size).toBe(0);
  });

  it('refuses to write anything when the generator fails', () => {
    // The one direction that must never happen: a failing generator whose empty output
    // is written over a good artifact, turning a red check into a green one by deleting
    // the thing it was checking.
    const fixable = check({ fixable: true });
    const ctx = testContext(producing('', 1));

    expect(() => (fixable as { fix: (c: typeof ctx) => unknown }).fix(ctx)).toThrow(/was not written/);
    expect(ctx.writes.size).toBe(0);
  });

  it('tells the reader the repair exists, but only when it does', async () => {
    const withFix = await check({ fixable: true }).run(testContext(producing('regenerated')));
    const without = await check().run(testContext(producing('regenerated')));

    expect(errorsOf(withFix)[0]).toContain('--fix');
    expect(errorsOf(without)[0]).not.toContain('--fix');
  });
});
