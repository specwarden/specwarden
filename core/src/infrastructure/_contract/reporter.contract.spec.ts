import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ICheckResult } from '../../domain';
import { JsonReporter } from '../json-reporter/json-reporter.adapter';
import { TtyReporter } from '../tty-reporter/tty-reporter.adapter';

function result(over: Partial<ICheckResult> & Pick<ICheckResult, 'meta'>): ICheckResult {
  return { verdict: { ok: true, findings: [] }, durationMs: 100, ...over };
}

const meta = (id: string, extra = {}) =>
  ({ id, title: id, tier: 'fast' as const, zone: 'consumer' as const, capabilities: [], contractVersion: 1, ...extra });

describe('TtyReporter', () => {
  it('renders findings verbatim between the frame lines', () => {
    let out = '';
    const r = new TtyReporter((t) => (out += t));
    r.checkStarted(meta('router-mirror', { title: 'router mirror' }));
    r.checkFinished(
      result({
        meta: meta('router-mirror', { title: 'router mirror' }),
        verdict: { ok: true, findings: [{ severity: 'info', message: '✓ router mirror — clean' }] },
        durationMs: 200,
      }),
    );
    expect(out).toContain('▶ router-mirror — router mirror\n');
    expect(out).toContain('✓ router mirror — clean\n');
    expect(out).toContain('✅ router-mirror — 0.2s\n');
  });

  it('marks a failing check and shows its hint', () => {
    let out = '';
    const r = new TtyReporter((t) => (out += t));
    r.checkFinished(
      result({ meta: meta('x', { hint: 'do the thing' }), verdict: { ok: false, findings: [] } }),
    );
    expect(out).toContain('❌ x FAILED');
    expect(out).toContain('💡 do the thing');
  });

  it('the run summary is red and names both counts when a gate failed', () => {
    let out = '';
    const r = new TtyReporter((t) => (out += t));
    const pass = result({ meta: meta('a') });
    const fail = result({ meta: meta('b'), verdict: { ok: false, findings: [] } });
    r.runFinished([pass, fail], 500);
    expect(out).toContain('❌ 1 gate(s) FAILED, 1 passed in 0.5s');
    expect(out).not.toContain('✅');
  });

  it('an advisory not-ok check warns, does not fail the summary, and is counted aside', () => {
    let out = '';
    const r = new TtyReporter((t) => (out += t));
    const pass = result({ meta: meta('a') });
    const warn = result({ meta: meta('orphan', { advisory: true }), verdict: { ok: false, findings: [] } });
    const skip = result({ meta: meta('c'), skipped: 'not-relevant' });
    r.runFinished([pass, warn, skip], 500);
    expect(out).toContain('✅ 1 gate(s) passed (1 warned, 1 skipped) in 0.5s');
  });
});

describe('a reporter never prints an environment variable value', () => {
  const SECRET = 'S3CR3T-do-not-leak';
  beforeEach(() => {
    process.env.SPW_TEST_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.SPW_TEST_SECRET;
  });

  it('TtyReporter output never contains the secret', () => {
    let out = '';
    const r = new TtyReporter((t) => (out += t));
    const res = result({ meta: meta('env-check'), verdict: { ok: false, findings: [{ severity: 'error', message: 'a key disagrees' }] } });
    r.checkStarted(res.meta);
    r.checkFinished(res);
    r.runFinished([res], 500);
    expect(out).not.toContain(SECRET);
  });

  it('JsonReporter output never contains the secret', () => {
    let out = '';
    const r = new JsonReporter((t) => (out += t));
    const res = result({ meta: meta('env-check'), verdict: { ok: false, findings: [{ severity: 'error', message: 'a key disagrees' }] } });
    r.checkFinished(res);
    r.runFinished([res], 500);
    expect(out).not.toContain(SECRET);
    // and it is valid JSON carrying the finding
    const parsed = JSON.parse(out);
    expect(parsed.results[0].findings[0].message).toBe('a key disagrees');
  });

  it('JsonReporter includes skipped checks (they never reach checkFinished)', () => {
    let out = '';
    const r = new JsonReporter((t) => (out += t));
    const ran = result({ meta: meta('a') });
    const skip = result({ meta: meta('b'), skipped: 'not-relevant' });
    // Only the ran check calls checkFinished; the skip is delivered to runFinished.
    r.checkFinished(ran);
    r.runFinished([ran, skip], 500);
    const parsed = JSON.parse(out);
    expect(parsed.results.map((x: { id: string }) => x.id)).toEqual(['a', 'b']);
    expect(parsed.results[1].skipped).toBe('not-relevant');
  });
});
