import { describe, expect, it } from 'vitest';

import { parseDecisionLog, rejectionsWithoutReason } from '../decision-log/decision-log.model';

describe('parseDecisionLog', () => {
  it('reads decisions and their rejected alternatives with reasons', () => {
    const log = [
      '### Decision: context-bag DI over constructor injection',
      '- Rejected: design:paramtypes — Vitest 4 oxc emits no decorator metadata',
      '- Rejected: a service locator because it hides the dependency graph',
      'some prose',
      '### Decision: esbuild bundle',
      '- Rejected: tsc directory imports — node ESM cannot resolve them',
    ].join('\n');
    const decisions = parseDecisionLog(log);
    expect(decisions).toHaveLength(2);
    expect(decisions[0].statement).toContain('context-bag');
    expect(decisions[0].rejected).toHaveLength(2);
    expect(decisions[0].rejected[0]).toMatchObject({
      alternative: 'design:paramtypes',
      reason: expect.stringContaining('oxc'),
    });
    expect(decisions[0].rejected[1].reason).toContain('hides the dependency graph');
  });

  it('reads a rejection with no reason as reason-less', () => {
    const decisions = parseDecisionLog('### Decision: x\n- Rejected: the other way');
    expect(decisions[0].rejected[0]).toEqual({ alternative: 'the other way' });
  });
});

describe('rejectionsWithoutReason', () => {
  it('finds only the rejections missing a reason', () => {
    const log = '### Decision: x\n- Rejected: a — because reasons\n- Rejected: b';
    const missing = rejectionsWithoutReason(parseDecisionLog(log));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ alternative: 'b', statement: 'x' });
  });
});
