import type { IPart } from '../_shared/part.model';

/**
 * The PERIMETER — what an assistant may not do here, as data evaluated BEFORE the action
 * runs, for the actions where "the model usually gets it right" is not good enough.
 *
 * It ships LIVE with the two rules nobody disagrees with, and FAILS OPEN on every error
 * path: a perimeter that turns a fault into a block halts the work while wearing the face
 * of a rule, and that is how a team learns to switch it off.
 *
 * The engine reads its rule ids as enforcers itself, so the register rule they enforce
 * resolves with nothing in the config pointing at this file.
 */
export const perimeterPart = (): IPart => ({
  files: [
    {
      path: 'perimeter.mjs',
      body: `// The PERIMETER — what an assistant may not do here, checked by a hook BEFORE the action runs.
// It fails OPEN: a missing file, a malformed payload, a rule that throws all allow. Each rule
// needs an id, a matcher, and a \`why\` saying what to do INSTEAD.
// Nothing is enforced until the hook is wired — Claude Code, in .claude/settings.json:
//   hooks.PreToolUse → node "$CLAUDE_PROJECT_DIR/node_modules/specwarden/bin/warden.mjs" perimeter
// Another assistant: export a \`runtime\` beside \`rules\` implementing IAgentRuntime.
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
`,
    },
  ],
  rules: [
    {
      id: 'no-irreversible-action-without-a-person',
      statement: 'An assistant never force-pushes or rewrites shared history.',
      owner: '',
      enforcement: { checkIds: ['no-force-push', 'no-history-rewrite-of-a-shared-branch'] },
    },
  ],
});
