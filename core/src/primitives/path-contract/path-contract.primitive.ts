import type { ICheck, ICheckIdentity, IFinding } from '../../domain';
import { buildCheck, pathMatches, verdictFrom } from '../_shared';

export interface IPathContractOptions extends ICheckIdentity {
  /** Glob identifying the kind of file this contract governs. */
  readonly kind: string;
  /** The globs a file of this kind may live under. Living outside all of them fails. */
  readonly allowedIn: readonly string[];
}

/**
 * A file of a kind lives only where its contract allows — `doc-placement`. An
 * undecided location is where a partial second copy is born, which is the most
 * expensive documentation defect measured in this corpus.
 */
export function pathContract(options: IPathContractOptions): ICheck {
  return buildCheck(options, ['read'], (ctx) => {
    const findings: IFinding[] = [];
    for (const file of ctx.files.glob(options.kind)) {
      const allowed = options.allowedIn.some((glob) => pathMatches(ctx, glob, file));
      if (!allowed) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} is of kind \`${options.kind}\` but lives outside its contract (${options.allowedIn.join(', ')}).`,
          ruleId: options.id,
        });
      }
    }
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
