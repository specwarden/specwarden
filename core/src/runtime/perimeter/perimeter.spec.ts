import { describe, expect, it } from 'vitest';

import type { IActionIntent } from '../../domain';
import { formatBlock, parseClaudeToolCall, perimeterExitCode } from '../../infrastructure';
import { commandRule, writeRule } from './command-rule/command-rule.factory';
import { PerimeterEngine } from './perimeter-engine/perimeter-engine.service';
import { commandWords, parseCommand, segments, stripHeredocs, tokens } from './bash-parse/bash-parse.util';

describe('bash-parse', () => {
  it('strips a heredoc body but keeps its opening line', () => {
    const out = stripHeredocs("git commit -F - <<'EOF'\ngit push origin prod\nEOF");
    expect(out).toContain('git commit -F -');
    expect(out).not.toContain('git push origin prod');
  });

  it('does not treat a HERESTRING as a heredoc opener', () => {
    // `<<<` feeds one string to stdin and opens nothing. Read as a heredoc, its
    // quoted argument becomes a terminator no later line equals, and every following
    // line is swallowed as body — the command below it is then never examined.
    const out = stripHeredocs('grep x <<< "${payload}"\ndocker compose down -v');

    expect(out).toContain('docker compose down -v');
  });

  it('splits a chain into segments a shell runs separately', () => {
    expect(segments('cd repo && git push origin prod')).toEqual(['cd repo', 'git push origin prod']);
  });

  it('splits on a single & (backgrounded command) as well as &&', () => {
    expect(segments('echo ok & git push origin prod')).toEqual(['echo ok', 'git push origin prod']);
    // && is still one separator, not two single &, so no empty segment leaks through.
    expect(segments('a && b')).toEqual(['a', 'b']);
  });

  it('tokenizes with one quote layer removed and drops env assignments', () => {
    expect(tokens('git push origin "prod"')).toEqual(['git', 'push', 'origin', 'prod']);
    expect(commandWords(tokens('CI=1 MODE=x docker rm -v db'))).toEqual(['docker', 'rm', '-v', 'db']);
  });
});

// A protected-branch rule, the same shape as the real one, to exercise the property.
const protectedBranch = commandRule({
  id: 'push-protected-branch',
  match(words) {
    if (words[0] !== 'git' || !words.includes('push')) return null;
    const args = words.slice(words.indexOf('push') + 1).filter((w) => !w.startsWith('-'));
    const target = args
      .map((a) => (a.includes(':') ? a.split(':').pop() : a))
      .map((t) => (t ?? '').replace(/^refs\/heads\//, ''));
    return target.includes('prod') ? 'git push … prod' : null;
  },
});

const bash = (command: string): IActionIntent => ({ tool: 'Bash', command, args: { command } });

describe('a forbidden command stays blocked under any disguise', () => {
  const engine = new PerimeterEngine([protectedBranch]);
  const DISGUISES = [
    'git push origin prod',
    'git  push   origin    prod',
    'CI=1 git push origin prod',
    'cd repo && git push origin prod',
    'echo ok & git push origin prod',
    'true; git push origin prod',
    'git push origin HEAD:prod',
    'git push origin "prod"',
    'git push origin refs/heads/prod',
  ];
  for (const command of DISGUISES) {
    it(`blocks: ${command}`, () => {
      expect(engine.evaluate(bash(command)).blocked).toBe(true);
    });
  }
});

describe('a lookalike that is not the command stays allowed', () => {
  const engine = new PerimeterEngine([protectedBranch]);
  it('allows a commit message quoting the command in a heredoc body', () => {
    expect(engine.evaluate(bash("git commit -F - <<'EOF'\ngit push origin prod\nEOF")).blocked).toBe(false);
  });
  it('allows a push to a non-protected branch', () => {
    expect(engine.evaluate(bash('git push origin my-feature')).blocked).toBe(false);
  });
});

describe('PerimeterEngine fails open', () => {
  it('a rule that throws does not block', () => {
    const boom = {
      id: 'boom',
      evaluate: () => {
        throw new Error('kaboom');
      },
    };
    expect(new PerimeterEngine([boom]).evaluate(bash('anything')).blocked).toBe(false);
  });
  it('the first blocking rule wins and carries its id', () => {
    const verdict = new PerimeterEngine([protectedBranch]).evaluate(bash('git push origin prod'));
    expect(verdict.ruleId).toBe('push-protected-branch');
    expect(formatBlock(verdict)).toContain('push-protected-branch');
  });
});

describe('writeRule', () => {
  const journal = writeRule({ id: 'migration-journal', match: (fp) => (/_journal\.json$/.test(fp) ? fp : null) });
  it('blocks a write to the forbidden file and ignores a shell', () => {
    expect(journal.evaluate({ tool: 'Write', writePath: 'server/drizzle/meta/_journal.json' }).blocked).toBe(true);
    expect(journal.evaluate({ tool: 'Write', writePath: 'src/x.ts' }).blocked).toBe(false);
    expect(journal.evaluate(bash('cat _journal.json')).blocked).toBe(false); // not a file tool
  });
});

describe('claude adapter and the return-code contract', () => {
  it('parses a PreToolUse payload into an intent', () => {
    const intent = parseClaudeToolCall({ tool_name: 'Bash', tool_input: { command: 'ls' } });
    expect(intent).toEqual({ tool: 'Bash', command: 'ls', args: { command: 'ls' } });
  });
  it('returns null for a non-tool-call payload', () => {
    expect(parseClaudeToolCall({})).toBeNull();
    expect(parseClaudeToolCall(null)).toBeNull();
  });
  it('maps only a block to exit 2', () => {
    expect(perimeterExitCode({ blocked: true })).toBe(2);
    expect(perimeterExitCode({ blocked: false })).toBe(0);
  });
});

describe('parseCommand end to end', () => {
  it('drops env prefixes and splits chains', () => {
    expect(parseCommand('A=1 docker rm -v db && echo hi')).toEqual([
      ['docker', 'rm', '-v', 'db'],
      ['echo', 'hi'],
    ]);
  });

  it('strips a heredoc body but keeps the opening line and its redirect', () => {
    // The noise inside the body is gone; the opening `echo done` line (with its
    // `<<X` operator) survives, because the redirection itself can be a violation.
    expect(parseCommand('echo done <<X\nnoise\nX')).toEqual([['echo', 'done', '<<X']]);
  });
});
