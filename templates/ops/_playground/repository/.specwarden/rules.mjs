// The rules no single check states — a check declares its own (`rule: '…'`) and its file owns it.
// Declaring the list, even empty, turns the rule audits on.
export const rules = [
  // Each switched-off example's rule: uncomment it when the example is renamed.
  // { id: 'env-files-agree', statement: 'Every key a service reads is set for every mode it runs in.', owner: '.specwarden/checks/ops/env-files-agree.check.mjs', enforcement: { checkIds: ['env-files-agree'] } },
  // { id: 'upstreams-resolve', statement: 'Every proxy upstream resolves where the proxy runs.', owner: '.specwarden/checks/ops/upstreams-resolve.check.mjs', enforcement: { checkIds: ['upstreams-resolve'] } },
  // { id: 'gate-coverage', statement: 'Every heavy gate runs in CI, and the merge waits for it.', owner: '.specwarden/checks/harness/gate-coverage.check.mjs', enforcement: { checkIds: ['gate-coverage'] } },
  // A rule no check can enforce is declared with the reason:
  // { id: 'reviews-before-merge', statement: 'Every change to main is reviewed by someone who did not write it.', owner: 'CONTRIBUTING.md', enforcement: { notMechanizable: 'No check can see a review; branch protection in the forge enforces it.' } },
];
