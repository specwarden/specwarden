import type { IFileSource } from '../../../domain';
import { inferSibling } from './infer-sibling/infer-sibling.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/** Only a habit this consistent is worth proposing as a rule; below it, a match is
 * probably a coincidence, and proposing it teaches distrust of the tool. */
const CONSISTENCY_THRESHOLD = 0.9;

/** The habits worth checking for. Kept small and universal; a plugin adds its own. */
const SIBLING_CANDIDATES: ReadonlyArray<{ when: string; require: string }> = [
  { when: '**/*.service.ts', require: '{name}.spec.ts' },
  { when: '**/*.controller.ts', require: '{name}.spec.ts' },
];

/**
 * `specwarden suggest` — the real answer to "authoring a rule is too big an ask".
 * It infers candidate rules from what the repository already does consistently, so
 * a person CONFIRMS a convention rather than composing one. Three guards against
 * mistaking a coincidence for a convention: a high threshold, exceptions ALWAYS
 * shown, and nothing enabled on its own.
 */
export function suggest(files: IFileSource, io: ICliIo): number {
  let proposed = 0;
  for (const candidate of SIBLING_CANDIDATES) {
    const inference = inferSibling(files, candidate.when, candidate.require);
    if (
      inference.total === 0 ||
      inference.ratio < CONSISTENCY_THRESHOLD ||
      inference.exceptions.length === inference.total
    ) {
      continue;
    }
    proposed++;
    io.out(
      `${Math.round(inference.ratio * 100)}% of ${inference.when} have ${inference.require} ` +
        `(${inference.satisfied} of ${inference.total}).\n`,
    );
    io.out(
      `  → siblingRequired({ subjects: '${inference.when}', require: '${inference.require}' }), ratchet ${inference.exceptions.length}.\n`,
    );
    if (inference.exceptions.length > 0) {
      const shown = inference.exceptions.slice(0, 5);
      io.out(`  exceptions: ${shown.join(', ')}${inference.exceptions.length > shown.length ? ', …' : ''}\n`);
    }
    io.out('\n');
  }
  if (proposed === 0) {
    io.out('No convention crossed the consistency threshold — nothing to suggest.\n');
  }
  io.out('Nothing was enabled. Copy a suggestion into .specwarden/warden.config.mjs to adopt it.\n');
  return 0;
}
