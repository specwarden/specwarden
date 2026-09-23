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
    id: 'no-credentials-in-tree',
    statement: 'A credential never enters the repository, not even a revoked one.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['secret-scan'] },
  },
  {
    id: 'paths-in-documentation-resolve',
    statement: 'Every repository-relative path named in documentation exists.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['doc-paths'] },
  },
  {
    id: 'the-suite-and-the-linter-pass',
    statement: 'Nothing merges while the linter or the test suite is red.',
    owner: '.specwarden/README.md',
    enforcement: { checkIds: ['unit'] },
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
