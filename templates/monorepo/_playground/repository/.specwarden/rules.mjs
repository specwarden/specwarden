// The rules no single check states — a check declares its own (`rule: '…'`) and its file owns it.
// Declaring the list, even empty, turns the rule audits on.
export const rules = [
  // Each switched-off example's rule: uncomment it when the example is renamed.
  // { id: 'build-order', statement: 'A package is built after everything it depends on.', owner: '.specwarden/checks/workspace/build-order.check.mjs', enforcement: { enforcedBy: ['build-order'] } },
  // { id: 'dependency-pins', statement: 'Frozen versions stay exact, and coordinated groups agree across workspaces.', owner: '.specwarden/checks/workspace/dependency-pins.check.mjs', enforcement: { enforcedBy: ['dependency-pins'] } },
  // { id: 'ci-coverage', statement: 'Every heavy check runs in CI, and the merge waits for it.', owner: '.specwarden/checks/ops/ci-coverage.check.mjs', enforcement: { enforcedBy: ['ci-coverage'] } },
  // A rule no check can enforce is declared with the reason:
  // { id: 'reviews-before-merge', statement: 'Every change to main is reviewed by someone who did not write it.', owner: 'CONTRIBUTING.md', enforcement: { notMechanizable: 'No check can see a review; branch protection in the forge enforces it.' } },
];
