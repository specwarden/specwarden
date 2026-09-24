/**
 * This repository checked by the modules it PUBLISHES — the agent roster, the plans, the
 * hand-written documentation.
 *
 * WHY THE MODULES AND NOT A SCRIPT OF OUR OWN. A `check-docs.mjs` here would be the one
 * place a module's opinion was re-implemented beside the module that ships it — and the
 * module would then be the only documentation check in the world this repository does not
 * run. Every defect these find in our own tree is one a consumer would have found first.
 */
import { agentDefinitions } from '@specwarden/agents';
import { docHygiene, docPaths } from '@specwarden/docs';
import { decisionLogShape, planShape, planStaleness } from '@specwarden/plans';

import { TEMPLATED, repositoryDir } from '../../../scripts/playgrounds.mjs';
import { ROOT } from '../../../scripts/playgrounds.mjs';

/**
 * Where a document is somebody else's: a template playground's repository is a consumer's
 * tree with its own paths, and its `.specwarden/` is what `init` writes — the template's
 * unit suite and playground own both.
 */
const CONSUMER_TREES = TEMPLATED.map((p) => `${repositoryDir(p).slice(ROOT.length).replace(/\\/g, '/')}/`);

export const checks = [
  agentDefinitions({
    id: 'agents',
    title: 'every role in the roster declares its tools and model, and none of them can spawn',
    tier: 'fast',
    agentsDir: '.claude/agents',
    required: ['name', 'description', 'tools', 'model'],
    // Nobody here spawns: a subagent cannot, and `lead` returns a plan for the main session
    // to run rather than running it. A role that gains the spawn tool has become an
    // orchestrator by accident.
    orchestrators: [],
    rule: {
      id: 'the-roster-is-well-formed',
      statement: 'every agent role names itself as its file does, declares its tools and model, and cannot spawn',
      owner: 'AGENTS.md',
    },
  }),

  docPaths({
    id: 'docs',
    title: 'every repository path the hand-written documentation names resolves',
    tier: 'fast',
    docs: '**/*.md',
    // A changeset describes a CONSUMER's tree, and a plan may name what does not exist yet
    // (`skills/plans/SKILL.md` §2) — neither is a claim about this repository. A CHANGELOG
    // is the changesets, copied by `changeset version`: the same consumer paths, and absent
    // until a release is being cut, so every run before that one was green over it. A
    // template playground's README names the files its defect scenes PLANT into a scratch
    // copy; they exist only there, by design, so the fixture stays green on day one.
    except: [...CONSUMER_TREES, '.changeset', '**/CHANGELOG.md', '_plans', 'templates/*/_playground/README.md'],
    rule: {
      id: 'a-documented-path-resolves',
      statement: 'a path named in this repository’s documentation exists — an agent follows it as an instruction',
      owner: 'skills/documentation/SKILL.md',
    },
  }),

  docHygiene({
    id: 'doc-links',
    title: 'every relative link in the documentation lands',
    tier: 'fast',
    docs: '**/*.md',
    rule: {
      id: 'a-documented-link-lands',
      statement: 'a relative link in this repository’s documentation points at a file that exists',
      owner: 'skills/documentation/SKILL.md',
    },
  }),

  planShape({
    id: 'plans',
    title: 'a plan names its phases’ acceptance, sizes nothing, and is filed flat',
    tier: 'fast',
    plansDir: '_plans',
    name: /^\d{2}-[a-z0-9-]+\.md$/,
    sizing: [/\b\d+\s*(hours?|days?|weeks?)\b/i, /\bstory\s*points?\b/i],
    phaseHeading: /^##+\s+Phase\b/im,
    command: /^\s*(?:\$|>|```(?:bash|sh))/m,
    rule: {
      id: 'a-plan-is-accepted-by-a-command',
      statement: 'every phase of a plan ends with a command that proves it, naming only checks that exist',
      owner: 'skills/plans/SKILL.md',
    },
  }),

  planStaleness({
    id: 'plan-staleness',
    title: 'an active plan’s branch still exists — the work has not landed unharvested',
    tier: 'fast',
    plansDir: '_plans',
    // Plans here are DELETED when harvested, not archived; the folder never exists, and
    // nothing may link to it.
    archiveDir: '_plans/_archive',
    // Its rule is in `rules.mjs`, which names this check as its enforcer — so the rule the
    // factory implies is dropped rather than registered beside it.
  }),

  decisionLogShape({
    id: 'plan-decisions',
    title: 'a rejected alternative in a plan carries its reason',
    tier: 'fast',
    docs: '_plans/*.md',
    rule: {
      id: 'a-rejection-carries-its-reason',
      statement: 'a decision log states, for each rejected alternative, why it lost',
      owner: 'skills/plans/SKILL.md',
    },
  }),
];
