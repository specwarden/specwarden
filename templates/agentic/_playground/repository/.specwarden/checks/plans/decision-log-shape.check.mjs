// `decision-log-shape` — a rejected alternative carries the reason it was rejected.
// The reason is the one fact in a decision log that exists nowhere else. `docs` is what is read.
import { decisionLogShape } from '@specwarden/plans';

export const check = decisionLogShape({
  docs: 'docs/**/*.md',
  rule: 'A decision log states, for each rejected alternative, why it was rejected.',
});
