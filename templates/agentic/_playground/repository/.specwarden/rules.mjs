// The rules no single check states — a check declares its own (`rule: '…'`) and its file owns it.
// Declaring the list, even empty, turns the rule audits on.
export const rules = [
  {
    id: 'no-irreversible-action-without-a-person',
    statement: 'An assistant never force-pushes or rewrites shared history.',
    owner: '.specwarden/perimeter.mjs',
    enforcement: { enforcedBy: ['no-force-push', 'no-history-rewrite-of-a-shared-branch'] },
  },
  // A rule no check can enforce is declared with the reason:
  // { id: 'reviews-before-merge', statement: 'Every change to main is reviewed by someone who did not write it.', owner: 'CONTRIBUTING.md', enforcement: { notMechanizable: 'No check can see a review; branch protection in the forge enforces it.' } },
];
