import { describe, expect, it } from 'vitest';

import type { IAgentRuntime, IPerimeterRule } from '../../../domain';
import { commandRule } from '../../perimeter';
import { evaluatePayload } from './perimeter.command';

/**
 * The perimeter's rules are about what an action DOES; the runtime is about which
 * assistant is asking and how it is answered. These prove the two are separable —
 * the same rule set, judged for a tool whose payload shape and exit-code contract
 * are nothing like Claude's.
 */

const RULES: readonly IPerimeterRule[] = [
  commandRule({
    id: 'no-force-push',
    why: 'a force-push rewrites a branch other people have',
    match: (words) =>
      words[0] === 'git' && words.includes('push') && words.includes('--force') ? words.join(' ') : null,
  }),
];

/** A fictional assistant: the command arrives under a different key, and its hook
 * contract blocks on 1 rather than on 2. */
const otherAssistant: IAgentRuntime = {
  name: 'other-assistant',
  parse: (payload) => {
    const p = payload as { action?: string; shell?: string };
    return p?.action === 'shell' && typeof p.shell === 'string' ? { tool: 'shell', command: p.shell, args: {} } : null;
  },
  exitCode: (v) => (v.blocked ? 1 : 0),
  formatBlock: (v) => `DENIED: ${v.reason ?? v.ruleId}`,
};

describe('the perimeter defaults to Claude Code', () => {
  it('blocks a Claude payload with exit 2', () => {
    const r = evaluatePayload({ tool_name: 'Bash', tool_input: { command: 'git push --force' } }, RULES);
    expect(r.code).toBe(2);
    expect(r.message).toContain('Blocked by the perimeter');
  });

  it('allows anything the rules do not name', () => {
    expect(evaluatePayload({ tool_name: 'Bash', tool_input: { command: 'git status' } }, RULES).code).toBe(0);
  });
});

describe('another assistant keeps every rule and none of the vendor shape', () => {
  it('reads its own payload format', () => {
    const r = evaluatePayload({ action: 'shell', shell: 'git push --force origin main' }, RULES, otherAssistant);
    expect(r.code).toBe(1);
    expect(r.message).toContain('DENIED: git push --force origin main');
    expect(r.message).toContain('a force-push rewrites a branch other people have');
  });

  it('uses its own exit code for an allowed action', () => {
    expect(evaluatePayload({ action: 'shell', shell: 'ls' }, RULES, otherAssistant).code).toBe(0);
  });

  it('a payload it does not recognise is nothing to judge, and allows', () => {
    // Fail-open is the contract: a guard that turns a fault into a block halts work
    // while wearing the face of a rule.
    expect(
      evaluatePayload({ tool_name: 'Bash', tool_input: { command: 'git push --force' } }, RULES, otherAssistant).code,
    ).toBe(0);
  });
});
