import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inScratchRepository, planted, provePlayground } from '../../../scripts/playground-proof.mjs';

/**
 * `init --template agentic` over a service most of whose commits are written by agents: a
 * roster under `.claude/agents/`, a router, an active plan with a decision log, and an
 * archived plan with its harvest header.
 *
 * This playground found a crash the moment it was written. The plan-shape check read a
 * heading's depth from a capture group of `phaseHeading`, and the regex this template
 * writes has none — so every repository scaffolded with it threw on its first plan with a
 * phase. The playground this replaced had no plans, so the check had never once been run
 * over one through the CLI.
 */

const read = (rel: string): string => readFileSync(new URL(`repository/${rel}`, import.meta.url), 'utf8');

const PLAN = 'docs/_plans/burst-allowance.md';
/** The branch the active plan is worked on — it has to exist while the plan is active. */
const BRANCHES = ['feat/burst-allowance'];

provePlayground(
  'agentic',
  {
    'agent-definitions': {
      why: 'a leaf reviewer that was given the power to spawn',
      edits: {
        '.claude/agents/reviewer.md': planted(
          read('.claude/agents/reviewer.md'),
          'tools: Read, Grep, Glob, Bash',
          'tools: Read, Grep, Glob, Bash, Agent',
        ),
      },
      says: 'reviewer.md',
    },
    'doc-paths': {
      why: 'the architecture naming a limiter file that was renamed',
      edits: {
        'docs/architecture.md': planted(read('docs/architecture.md'), 'src/limits/bucket.ts', 'src/limits/window.ts'),
      },
      says: 'src/limits/window.ts',
    },
    'decision-log-shape': {
      why: 'a rejected alternative with its reason cut off',
      edits: {
        'docs/architecture.md': [
          '# Architecture',
          '',
          '### Decision: a token bucket, not a fixed window',
          '',
          '- Rejected: a fixed one-minute window',
          '',
        ].join('\n'),
      },
      says: 'a fixed one-minute window',
    },
    'plan-shape': {
      why: 'a phase sized in days instead of stated as a dependency',
      edits: {
        [PLAN]: planted(
          read(PLAN),
          "The bucket's capacity becomes rate plus burst; refill is unchanged.",
          "The bucket's capacity becomes rate plus burst. Should take 2 days.",
        ),
      },
      says: 'sizes work',
    },
    'plan-staleness': {
      why: 'an active plan whose branch was merged and deleted — the work landed, the plan stayed',
      edits: { [PLAN]: planted(read(PLAN), 'feat/burst-allowance', 'feat/burst-allowance-v1') },
      says: 'burst-allowance',
    },
  },
  { describe, it, expect, beforeAll, afterAll },
  { branches: BRANCHES },
);

/**
 * The perimeter the template writes, fed the payload Claude Code's PreToolUse hook sends.
 *
 * A perimeter policy is not a check — no `check` run ever reaches it — so the proof above
 * cannot see it. These run the real hook command in the scaffolded repository.
 */
describe('the perimeter the agentic template writes, as the hook runs it', () => {
  const bash = (command: string) => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

  it('blocks a force-push with exit 2, and says what to do instead', () => {
    const run = inScratchRepository('agentic', { branches: BRANCHES }, ({ specwarden }) =>
      specwarden(['perimeter'], { input: bash('git push --force origin main') }),
    );

    // Exit 2 is the ONLY code Claude Code treats as a block; anything else lets it run.
    expect(run.status).toBe(2);
    expect(`${run.stdout}${run.stderr}`).toContain('no-force-push');
  }, 60_000);

  it('lets an ordinary push through', () => {
    const run = inScratchRepository('agentic', { branches: BRANCHES }, ({ specwarden }) =>
      specwarden(['perimeter'], { input: bash('git push origin feat/burst-allowance') }),
    );

    expect(run.status).toBe(0);
  }, 60_000);

  it('fails OPEN on a payload it cannot read — a fault must never wear the face of a rule', () => {
    const run = inScratchRepository('agentic', { branches: BRANCHES }, ({ specwarden }) =>
      specwarden(['perimeter'], { input: '{not json' }),
    );

    expect(run.status).toBe(0);
  }, 60_000);
});
