import type { IFileSource } from '../../../domain';
import { CONFIG_DIR } from '../_shared/find-config/find-config.util';
import { type ISiblingInference, inferSibling } from './infer-sibling/infer-sibling.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/** Only a habit this consistent is worth proposing as a rule; below it, a match is
 * probably a coincidence, and proposing it teaches distrust of the tool. */
const CONSISTENCY_THRESHOLD = 0.9;

/** The habits worth checking for. Kept small and universal; a plugin adds its own. */
const SIBLING_CANDIDATES: ReadonlyArray<{ when: string; require: string }> = [
  { when: '**/*.service.ts', require: '{name}.spec.ts' },
  { when: '**/*.controller.ts', require: '{name}.spec.ts' },
];

/** A name for the proposed check, from what it pairs: `service-has-spec`. */
const idFor = (i: ISiblingInference): string => {
  // The word before the extension: `**/*.service.ts` → `service`, `{name}.spec.ts` → `spec`.
  const kind = (glob: string) => glob.split('.').slice(-2, -1).join('');
  return `${kind(i.when)}-has-${kind(i.require)}`.toLowerCase();
};

/**
 * The whole check file, as it would be saved — imports, rule, ratchet — so pasting it is
 * the entire adoption. A call to paste INTO something is a second step somebody has to
 * know, and the file it named (the config) is not where a check lives.
 */
function checkFile(i: ISiblingInference): string {
  const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return [
    "import { siblingRequired } from 'specwarden';",
    '',
    'export const check = siblingRequired({',
    `  subjects: ${q(i.when)},`,
    `  require: ${q(i.require)},`,
    // The exceptions that exist today are tolerated, and the count only turns down.
    `  ratchet: ${i.exceptions.length},`,
    `  rule: ${q(`Every ${i.when} has its ${i.require} beside it.`)},`,
    '});',
  ].join('\n');
}

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
    io.out(`  Save as ${CONFIG_DIR}/checks/tests/${idFor(inference)}.check.mjs:\n\n`);
    io.out(`${checkFile(inference)}\n\n`);
  }
  if (proposed === 0) {
    io.out('No convention crossed the consistency threshold — nothing to suggest.\nNothing was enabled.\n');
    return 0;
  }
  io.out('Nothing was enabled. Save a suggestion as the file it names, and the next run holds it.\n');
  return 0;
}
