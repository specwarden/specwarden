import type { IPart } from '../_shared/part.model';

/**
 * The PERIMETER — what an assistant may not do here, as data evaluated BEFORE the
 * action runs.
 *
 * These are the actions where "the model usually gets it right" is not good enough,
 * because there is no undo. Prose in a router file is advice the model may or may not
 * have read; a perimeter rule is a decision the hook makes without it.
 *
 * It ships LIVE, with the two rules nobody disagrees with, and it FAILS OPEN on every
 * error path — a missing file, a malformed payload, a rule that throws all allow. A
 * perimeter that turns a fault into a block halts the work while wearing the face of a
 * rule, and that is how a team learns to switch it off.
 *
 * The rule IDS are enforcers the engine cannot see, so this part also contributes the
 * config field that tells it — see `configExtras` below.
 */
export const perimeterPart = (): IPart => ({
  files: [
    {
      path: 'perimeter.mjs',
      body: `/**
 * The PERIMETER — what an assistant may not do here, evaluated BEFORE the action runs.
 *
 * The engine reads this file from a PreToolUse hook, matches the intent against each
 * rule, and blocks with the reason. It FAILS OPEN on every error path: a missing file,
 * a malformed payload, a rule that throws — all allow. A perimeter that turns a fault
 * into a block halts the work while wearing the face of a rule, and that teaches people
 * to switch it off.
 *
 * The two below are the ones nobody disagrees with. Add yours; each needs an id, a
 * matcher, and a \`why\` that says what to do INSTEAD — a refusal without an alternative
 * is an obstacle.
 *
 * Wire it up (Claude Code):
 *   .claude/settings.json → hooks.PreToolUse →
 *     node "$CLAUDE_PROJECT_DIR/node_modules/specwarden/bin/warden.mjs" perimeter
 *
 * ANOTHER ASSISTANT: export a \`runtime\` beside \`rules\` implementing IAgentRuntime —
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
  /**
   * The perimeter's rule ids are ENFORCERS, and the engine cannot see them.
   *
   * `enforcement-resolves` reconciles every enforcer a rule names against the roster of
   * checks — and a perimeter rule is not a check: it lives in `perimeter.mjs` and is
   * evaluated by a hook, not by a run. Without this the audit fails on the tree the
   * scaffold just wrote, which is the harness reporting its own output as a defect.
   */
  configExtras: {
    imports: "import { rules as perimeterRules } from './perimeter.mjs';",
    fields: `
  harness: {
    // The perimeter's rule ids count as enforcers: rules.mjs names them, and the hook
    // evaluates them, so renaming one there must fail a gate here rather than quietly
    // un-declaring a rule about an irreversible action.
    otherEnforcerIds: () => perimeterRules.map((r) => r.id),
  },
`,
  },
});
