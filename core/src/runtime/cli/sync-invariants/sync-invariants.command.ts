import { invariantsInDocument, planInvariantSync } from '../../../domain';
import type { IExistingInvariant, IFileSource, ISpecSource } from '../../../domain';
import type { IWardenConfig } from '../../config/config.model';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/**
 * `specwarden sync-invariants` — the seam interop exists for. It reads the
 * requirements from the configured spec source, finds the invariants already
 * deposited in the corpus, and PREPARES the two-way reconciliation: which
 * requirements have no invariant yet, and which invariants have lost their
 * requirement. It PRINTS the proposed edit and writes nothing — a requirement's
 * wording was written for approval, and turning it into a module invariant, read as
 * truth about behaviour, is a human's decision.
 */
export function syncInvariants(config: IWardenConfig, files: IFileSource, io: ICliIo): number {
  const source: ISpecSource | undefined = config.specSource;
  if (!source) {
    io.out('no specSource configured — nothing to sync. Declare one in warden.config (native plans, or an adapter).\n');
    return 0;
  }
  const result = source.requirements(files);
  if (!result.found) {
    io.out(
      `spec source "${source.name}" found nothing: ${result.note ?? 'no requirements'}. (This is not a green light — it means the source could not be read.)\n`,
    );
    return 0;
  }

  const existing: IExistingInvariant[] = [];
  if (config.invariants) {
    for (const doc of files.glob(config.invariants.docs)) {
      existing.push(...invariantsInDocument(doc, files.read(doc), config.invariants.idPattern));
    }
  }

  const plan = planInvariantSync(result.items, existing);

  io.out(
    `sync-invariants — ${source.name}: ${result.items.length} requirement(s), ${existing.length} invariant(s) found\n\n`,
  );

  if (plan.toDeposit.length) {
    io.out(
      `${plan.toDeposit.length} requirement(s) with no invariant yet — propose depositing (a human decides the module and the pinning):\n`,
    );
    for (const d of plan.toDeposit) io.out(`  + ${d.id}  ${d.statement}\n`);
    io.out('\n');
  }
  if (plan.orphaned.length) {
    io.out(
      `${plan.orphaned.length} invariant(s) whose requirement has vanished — reconcile (retire the invariant, or restore the requirement):\n`,
    );
    for (const o of plan.orphaned) io.out(`  - ${o.id}  (${o.location})\n`);
    io.out('\n');
  }
  if (!plan.toDeposit.length && !plan.orphaned.length) {
    io.out(
      `✓ in sync — every requirement has an invariant and every invariant a requirement (${plan.inSync.length}).\n`,
    );
  }

  io.out(
    'Nothing was written. Apply the deposits by hand — a requirement becomes a module invariant only when a person decides it does.\n',
  );
  return 0;
}
