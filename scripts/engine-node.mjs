/**
 * The Node the proofs run the ENGINE on — the Node a consumer has.
 *
 * The one running the suite, unless `PLAYGROUND_NODE` names another binary: that is how
 * the published floor is proved (`.github/workflows/ci.yml`, `runtimes`). The suites
 * themselves cannot move — vitest needs Node 20 — so what moves is exactly what a
 * consumer's Node executes: the CLI, the published entry points `verify-build` imports,
 * and a check's own test under `node --test`. The consumer's OWN commands (a fixture's
 * `npm test`) run on whatever the PATH resolves, as they would in the consumer's
 * repository, where that Node is theirs to choose.
 *
 * A named binary that does not exist is an error, never a fallback: a proof that quietly
 * ran on the development Node would report the floor as held.
 *
 * The name is the repository's, not the product's: the engine reads `SPECWARDEN_*`, and a
 * variable that only these proofs read must not look like one of its settings.
 */
import { existsSync } from 'node:fs';

export function engineNode(chosen) {
  if (!chosen) return process.execPath;
  if (!existsSync(chosen)) throw new Error(`PLAYGROUND_NODE names ${chosen}, and there is no such file.`);
  return chosen;
}

export const ENGINE_NODE = engineNode(process.env.PLAYGROUND_NODE);
