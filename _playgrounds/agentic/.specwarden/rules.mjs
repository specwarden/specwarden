/**
 * What this repository has DECIDED — separate from what it can check.
 *
 * A rule is a decision with an owner document. Some are enforced by a check; some
 * cannot be mechanised at all, and those are declared here WITH A REASON rather than
 * left unsaid. That is the point of the file: `specwarden doctor` can then answer
 * "what do we believe, and how much of it is actually verified" — a question no list
 * of passing checks answers.
 *
 * The engine refuses a rule that is unenforced AND has no stated reason. Not because
 * every rule must be automated, but because "we never got to it" and "this cannot be
 * automated" are different states, and only one of them is finished.
 *
 * Declaring this list — even empty — turns the rule audits on. With no `rules` key at
 * all the engine leaves them off, so a repository with checks and no rules yet is not
 * met by a red orphan-check for the checks it just enabled.
 */
export const rules = [
  {
    id: 'an-agent-role-loads-or-fails-loudly',
    statement: 'Every agent definition parses and declares what it is for.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['agent-definitions'] },
  },
  {
    id: 'paths-in-documentation-resolve',
    statement: 'Every repository-relative path named in documentation exists.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['doc-paths'] },
  },
  {
    id: 'a-finished-plan-leaves-the-live-corpus',
    statement: 'A plan is archived when its work ends; nothing outside the archive cites it.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['plan-staleness'] },
  },
  {
    id: 'a-plan-expresses-dependency-not-effort',
    statement: 'Phases express dependency and deployability, and each names how it is accepted.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['plan-shape'] },
  },
  {
    id: 'a-rejection-carries-its-reason',
    statement: 'A decision log states, for each rejected alternative, why it was rejected.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['decision-log-shape'] },
  },
  {
    id: 'no-irreversible-action-without-a-person',
    statement: 'An assistant never force-pushes or rewrites shared history.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['no-force-push', 'no-history-rewrite-of-a-shared-branch'] },
  },
  // A rule nothing can mechanise is still declared — with the reason, which is what
  // separates "we never got to it" from "this cannot be automated":
  // {
  //   id: 'reviews-before-merge',
  //   statement: 'Every change to main is reviewed by someone who did not write it.',
  //   owner: 'CONTRIBUTING.md',
  //   enforcement: { notMechanizable: 'Enforced by branch protection in the forge, not here.' },
  // },
];
