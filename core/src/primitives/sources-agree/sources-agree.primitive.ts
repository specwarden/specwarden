import type { ICheck, ICheckContext, ICheckIdentity, IFinding } from '../../domain';
import { buildCheck, verdictFrom } from '../_shared';

export interface INamedSource {
  /** How this source is named in a finding. */
  readonly name: string;
  /** The set of names this source describes. */
  readonly extract: (ctx: ICheckContext) => readonly string[];
}

export interface ISourcesAgreeOptions extends ICheckIdentity {
  readonly a: INamedSource;
  readonly b: INamedSource;
}

/**
 * Two sources describe the same set — `service-tiers`, where a compose file and a
 * shell table must list the same services. A member present in one and missing from
 * the other is silent on a running system until it is not.
 */
export function sourcesAgree(options: ISourcesAgreeOptions): ICheck {
  return buildCheck(options, ['read'], (ctx) => {
    const a = new Set(options.a.extract(ctx));
    const b = new Set(options.b.extract(ctx));
    const findings: IFinding[] = [];
    for (const name of a) {
      if (!b.has(name)) {
        findings.push({ severity: 'error', message: `\`${name}\` is in ${options.a.name} but not ${options.b.name}.`, ruleId: options.id });
      }
    }
    for (const name of b) {
      if (!a.has(name)) {
        findings.push({ severity: 'error', message: `\`${name}\` is in ${options.b.name} but not ${options.a.name}.`, ruleId: options.id });
      }
    }
    return verdictFrom(findings);
  });
}
