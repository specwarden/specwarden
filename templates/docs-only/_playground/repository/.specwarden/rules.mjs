// The rules no single check states — a check declares its own (`rule: '…'`) and its file owns it.
// Declaring the list, even empty, turns the rule audits on.
export const rules = [
  // Each switched-off example's rule: uncomment it when the example is renamed.
  // { id: 'doc-counts', statement: 'A count in prose is re-derived from the repository, not restated.', owner: '.specwarden/checks/docs/doc-counts.check.mjs', enforcement: { checkIds: ['doc-counts'] } },
  // { id: 'doc-placement', statement: 'Every document sits where the placement contract puts its kind.', owner: '.specwarden/checks/docs/doc-placement.check.mjs', enforcement: { checkIds: ['doc-placement'] } },
  // A rule no check can enforce is declared with the reason:
  // { id: 'reviews-before-merge', statement: 'Every change to main is reviewed by someone who did not write it.', owner: 'CONTRIBUTING.md', enforcement: { notMechanizable: 'No check can see a review; branch protection in the forge enforces it.' } },
];
