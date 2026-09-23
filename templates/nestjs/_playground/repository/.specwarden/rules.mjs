// The rules no single check states — a check declares its own (`rule: '…'`) and its file owns it.
// Declaring the list, even empty, turns the rule audits on.
export const rules = [
  // Each switched-off example's rule: uncomment it when the example is renamed.
  // { id: 'migrations-backwards-compatible', statement: 'A migration never breaks the code still running during the deploy.', owner: '.specwarden/checks/backend/migrations-backwards-compatible.check.mjs', enforcement: { checkIds: ['migrations-backwards-compatible'] } },
  // { id: 'env-files-agree', statement: 'Every key a service reads is set for every mode it runs in.', owner: '.specwarden/checks/ops/env-files-agree.check.mjs', enforcement: { checkIds: ['env-files-agree'] } },
  // A rule no check can enforce is declared with the reason:
  // { id: 'reviews-before-merge', statement: 'Every change to main is reviewed by someone who did not write it.', owner: 'CONTRIBUTING.md', enforcement: { notMechanizable: 'No check can see a review; branch protection in the forge enforces it.' } },
];
