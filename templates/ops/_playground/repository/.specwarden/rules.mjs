// The rules no single check states — a check declares its own (`rule: '…'`) and its file owns it.
// Declaring the list, even empty, turns the rule audits on.
export const rules = [
  // Each switched-off example's rule: uncomment it when the example is renamed.
  // { id: 'env-pairing', statement: 'Every key a service reads is set for every mode it runs in.', owner: '.specwarden/checks/ops/env-pairing.check.mjs', enforcement: { enforcedBy: ['env-pairing'] } },
  // { id: 'proxy-upstreams', statement: 'Every proxy upstream resolves where the proxy runs.', owner: '.specwarden/checks/ops/proxy-upstreams.check.mjs', enforcement: { enforcedBy: ['proxy-upstreams'] } },
  // { id: 'ci-coverage', statement: 'Every heavy check runs in CI, and the merge waits for it.', owner: '.specwarden/checks/ops/ci-coverage.check.mjs', enforcement: { enforcedBy: ['ci-coverage'] } },
  // A rule no check can enforce is declared with the reason:
  // { id: 'reviews-before-merge', statement: 'Every change to main is reviewed by someone who did not write it.', owner: 'CONTRIBUTING.md', enforcement: { notMechanizable: 'No check can see a review; branch protection in the forge enforces it.' } },
];
