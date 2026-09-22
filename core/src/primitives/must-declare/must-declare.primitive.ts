import type { ICheck, ICheckIdentity, IFinding } from '../../domain';
import { buildCheck, testStateless, verdictFrom } from '../_shared';

export interface IMustDeclareField {
  readonly name: string;
  /** The pattern whose presence proves the field is declared. */
  readonly pattern: RegExp;
}

export interface IMustDeclareOptions extends ICheckIdentity {
  /** Glob of files that must carry the declarations. */
  readonly files: string;
  readonly fields: readonly IMustDeclareField[];
}

/**
 * Files of a kind must declare certain fields — `e2e-manifest` (tier/touches/
 * requires) and `agent-definitions` (name/description/tools/model). A missing field
 * is invisible until the thing it governs behaves wrong; this makes it a red gate.
 */
export function mustDeclare(options: IMustDeclareOptions): ICheck {
  return buildCheck(options, ['read'], (ctx) => {
    const findings: IFinding[] = [];
    for (const file of ctx.files.glob(options.files)) {
      const content = ctx.files.read(file);
      for (const field of options.fields) {
        if (!testStateless(field.pattern, content)) {
          findings.push({
            severity: 'error',
            file,
            message: `${file} does not declare \`${field.name}\`.`,
            ruleId: options.id,
          });
        }
      }
    }
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
