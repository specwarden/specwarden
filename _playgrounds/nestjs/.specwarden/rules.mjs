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
    id: 'a-module-reaches-the-database-through-a-repository',
    statement: 'A module never imports the ORM directly; persistence goes through a repository.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['nestjs/db-access-through-repositories'] },
  },
  {
    id: 'no-credentials-in-tree',
    statement: 'A credential never enters the repository, not even a revoked one.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['secret-scan'] },
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
