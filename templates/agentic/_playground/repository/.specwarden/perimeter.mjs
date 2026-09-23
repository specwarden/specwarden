/**
 * The PERIMETER — what an assistant may not do here, evaluated BEFORE the action runs.
 *
 * The engine reads this file from a PreToolUse hook, matches the intent against each
 * rule, and blocks with the reason. It FAILS OPEN on every error path: a missing file,
 * a malformed payload, a rule that throws — all allow. A perimeter that turns a fault
 * into a block halts the work while wearing the face of a rule, and that teaches people
 * to switch it off.
 *
 * The two below are the ones nobody disagrees with. Add yours; each needs an id, a
 * matcher, and a `why` that says what to do INSTEAD — a refusal without an alternative
 * is an obstacle.
 *
 * Wire it up (Claude Code):
 *   .claude/settings.json → hooks.PreToolUse →
 *     node "$CLAUDE_PROJECT_DIR/node_modules/specwarden/bin/warden.mjs" perimeter
 *
 * ANOTHER ASSISTANT: export a `runtime` beside `rules` implementing IAgentRuntime —
 * parse that assistant's payload, choose its exit code, phrase its refusal. The RULES
 * do not change, and neither does anything else here.
 */
import { commandRule } from 'specwarden';

export const rules = [
  commandRule({
    id: 'no-force-push',
    why: 'a force-push rewrites a branch other people have. Push a new commit, or ask the owner.',
    match: (words) => (words[0] === 'git' && words.includes('push') && words.some((w) => w === '--force' || w === '-f') ? words.join(' ') : null),
  }),
  commandRule({
    id: 'no-history-rewrite-of-a-shared-branch',
    why: 'a rebase or a reset --hard on a shared branch discards work that is not yours to discard.',
    match: (words) => {
      if (words[0] !== 'git') return null;
      const rewrites = words.includes('rebase') || (words.includes('reset') && words.includes('--hard'));
      return rewrites ? words.join(' ') : null;
    },
  }),
];
