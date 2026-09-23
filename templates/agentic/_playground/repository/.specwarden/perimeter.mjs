// The PERIMETER — what an assistant may not do here, checked by a hook BEFORE the action runs.
// It fails OPEN: a missing file, a malformed payload, a rule that throws all allow. Each rule
// needs an id, a matcher, and a `why` saying what to do INSTEAD.
// Nothing is enforced until the hook is wired — Claude Code, in .claude/settings.json:
//   hooks.PreToolUse → node "$CLAUDE_PROJECT_DIR/node_modules/specwarden/bin/warden.mjs" perimeter
// Another assistant: export a `runtime` beside `rules` implementing IAgentRuntime.
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
