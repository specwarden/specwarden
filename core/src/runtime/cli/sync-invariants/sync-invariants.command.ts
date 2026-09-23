import { invariantsInDocument, planInvariantSync } from '../../../domain';
import type { IExistingInvariant, IFileSource, ISpecSource, IVcs } from '../../../domain';
import type { IWardenConfig } from '../../config/config.model';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/** A source's note as a whole sentence: its own closing mark kept, a full stop added only
 * where it has none — it read '…elsewhere.. (This is not…' and '…installed here?. (This'. */
const sentence = (note: string): string => (/[.!?]$/.test(note.trim()) ? note.trim() : `${note.trim()}.`);

/**
 * `specwarden sync-invariants` — the seam interop exists for. It reads the
 * requirements from the configured spec source, finds the invariants already
 * deposited in the corpus, and PREPARES the two-way reconciliation: which
 * requirements have no invariant yet, and which invariants have lost their
 * requirement. It PRINTS the proposed edit and writes nothing — a requirement's
 * wording was written for approval, and turning it into a module invariant, read as
 * truth about behaviour, is a human's decision.
 */
export function syncInvariants(config: IWardenConfig, files: IFileSource, io: ICliIo, vcs?: IVcs): number {
  const source: ISpecSource | undefined = config.specSource;
  if (!source) {
    io.out('no specSource configured — nothing to sync. Declare one in warden.config (native plans, or an adapter).\n');
    return 0;
  }
  const result = source.requirements(files);
  // A source that could not be read is a source this command could not use — exit 2,
  // as the rest of the CLI says it. Exit 0 let a CI step reconcile against a spec tree
  // that was not there and pass, with the only warning in prose nobody reads in a log.
  if (!result.found) {
    io.out(
      `spec source "${source.name}" found nothing: ${sentence(result.note ?? 'no requirements')} (This is not a green light — it means the source could not be read.)\n`,
    );
    return 2;
  }
  // FOUND, and empty. The OpenSpec adapter was fixed to report this with a note instead of
  // passing it off as agreement — and this command never read the note: with no
  // requirements there is nothing to deposit and nothing orphaned, so it printed "✓ in
  // sync". A reconciliation over nothing is the check that cannot fail, one layer up.
  if (result.items.length === 0) {
    io.out(
      `spec source "${source.name}" holds no requirements: ${sentence(result.note ?? 'nothing to reconcile against')} (This is not "in sync" — there was nothing to compare.)\n`,
    );
    return 0;
  }

  const existing: IExistingInvariant[] = [];
  if (config.invariants) {
    // TRACKED documents, when there is version control to ask — the same corpus every check
    // reads. A working-tree glob over `**/*.md` found an invariant inside `node_modules/`,
    // and a marker in an installed dependency is not one this repository deposited.
    const docs = vcs ? vcs.trackedFiles(config.invariants.docs) : files.glob(config.invariants.docs);
    for (const doc of docs) {
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
