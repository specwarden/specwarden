import { describe, expect, it } from 'vitest';

import { ALLOW } from '../../../domain';
import { claudeAgentRuntime, formatBlock, parseClaudeToolCall, perimeterExitCode } from './claude.adapter';

/**
 * The one place that knows Claude's hook payload. Everything downstream judges an
 * INTENT — a command, a written path — so the invariant is the translation: a payload
 * that means "run this" or "write there" must arrive as exactly that, and a payload
 * that is malformed must arrive as nothing rather than as a half-filled intent a rule
 * could misread.
 */
describe('parseClaudeToolCall', () => {
  it('turns Bash into a command, and only Bash', () => {
    const intent = parseClaudeToolCall({ tool_name: 'Bash', tool_input: { command: 'git push' } });

    expect(intent).toEqual({ tool: 'Bash', command: 'git push', writePath: undefined, args: { command: 'git push' } });
  });

  it.each(['Write', 'Edit', 'NotebookEdit'])(
    'turns %s into a writePath, so a write rule sees every editing tool',
    (tool) => {
      const intent = parseClaudeToolCall({ tool_name: tool, tool_input: { file_path: 'db/journal.json' } });

      expect(intent?.writePath).toBe('db/journal.json');
      expect(intent?.command).toBeUndefined();
    },
  );

  /**
   * A `command` field on a tool that is not the shell is not a command. Read as one, a
   * tool whose input merely MENTIONS `git push --force` in a field of that name would
   * be blocked as if it had run it.
   */
  it('does not read a command off a tool that is not the shell', () => {
    const intent = parseClaudeToolCall({
      tool_name: 'Grep',
      tool_input: { command: 'git push --force', file_path: 'x' },
    });

    expect(intent?.command).toBeUndefined();
    expect(intent?.writePath).toBeUndefined();
    expect(intent?.tool).toBe('Grep');
  });

  it('leaves a non-string command or file_path unset rather than coercing it', () => {
    expect(
      parseClaudeToolCall({ tool_name: 'Bash', tool_input: { command: ['git', 'push'] } })?.command,
    ).toBeUndefined();
    expect(parseClaudeToolCall({ tool_name: 'Write', tool_input: { file_path: 42 } })?.writePath).toBeUndefined();
  });

  it('treats a missing or non-object tool_input as empty input, still a tool call', () => {
    expect(parseClaudeToolCall({ tool_name: 'Bash' })).toEqual({
      tool: 'Bash',
      command: undefined,
      writePath: undefined,
      args: {},
    });
    expect(parseClaudeToolCall({ tool_name: 'Bash', tool_input: 'git push' })?.args).toEqual({});
    expect(parseClaudeToolCall({ tool_name: 'Bash', tool_input: null })?.args).toEqual({});
  });

  it.each([null, undefined, 'Bash', 42, [], {}, { tool_name: 7 }, { tool_input: { command: 'x' } }])(
    'answers null — nothing to judge — for %j',
    (payload) => {
      expect(parseClaudeToolCall(payload)).toBeNull();
    },
  );
});

describe('perimeterExitCode', () => {
  /**
   * Only 2 blocks a PreToolUse call; every other code is a harness error that lets
   * the call through. Anything but 0 for an allow would be noise on every tool call.
   */
  it('maps a block to 2 and an allow to 0 — nothing else', () => {
    expect(perimeterExitCode({ blocked: true, ruleId: 'r', reason: 'x' })).toBe(2);
    expect(perimeterExitCode(ALLOW)).toBe(0);
  });
});

describe('formatBlock', () => {
  it('shows the reason the rule gave', () => {
    const text = formatBlock({ blocked: true, ruleId: 'no-force-push', reason: 'force push to dev' });

    expect(text).toContain('🚫 Blocked by the perimeter: force push to dev\n');
    expect(text).not.toContain('no-force-push');
  });

  it('falls back to the rule id when no reason was given', () => {
    expect(formatBlock({ blocked: true, ruleId: 'no-force-push' })).toContain(
      'Blocked by the perimeter: no-force-push\n',
    );
  });

  it('still says SOMETHING when the verdict names neither — a blank block reads as a crash', () => {
    expect(formatBlock({ blocked: true })).toContain('Blocked by the perimeter: a repository rule\n');
  });

  /** The model retries a denied call it reads as a permission prompt; the text is what stops it. */
  it('tells the model this is a rule, not a prompt to retry or route around', () => {
    const text = formatBlock({ blocked: true, reason: 'x' });

    expect(text).toContain('not a permission prompt');
    expect(text).toContain('do not retry it verbatim');
  });
});

describe('claudeAgentRuntime', () => {
  it('is the three functions behind the port, spreadable so a house can replace one', () => {
    expect(claudeAgentRuntime.name).toBe('claude-code');
    expect(claudeAgentRuntime.parse).toBe(parseClaudeToolCall);
    expect(claudeAgentRuntime.exitCode).toBe(perimeterExitCode);
    expect(claudeAgentRuntime.formatBlock).toBe(formatBlock);

    const custom = { ...claudeAgentRuntime, formatBlock: () => 'mine' };
    expect(custom.formatBlock({ blocked: true })).toBe('mine');
    expect(custom.parse).toBe(parseClaudeToolCall);
  });
});
