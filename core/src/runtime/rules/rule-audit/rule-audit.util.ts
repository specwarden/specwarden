import type { IFileSource, IFinding, IRule } from '../../../domain';

/**
 * The two integrity checks over the rule↔check link, expressed as pure functions
 * so both a report and a check can use them.
 *
 * `orphanChecks` — an enforcer that names no rule is a defect (the asymmetry: a
 * rule may stand alone if declared, an enforcer may not). `ruleOwnerResolves` — a
 * rule whose owner document is gone is a rule with no place its rationale is
 * written.
 */

/** Check ids that no rule names as an enforcer. */
export function orphanChecks(checkIds: readonly string[], rules: readonly IRule[]): readonly string[] {
  const enforcing = new Set<string>();
  for (const rule of rules) {
    if ('checkIds' in rule.enforcement) for (const id of rule.enforcement.checkIds) enforcing.add(id);
  }
  return checkIds.filter((id) => !enforcing.has(id));
}

/** Findings for rules whose owner document does not exist. */
export function ruleOwnerFindings(rules: readonly IRule[], files: IFileSource, ruleId = 'rule-owner-resolves'): readonly IFinding[] {
  const findings: IFinding[] = [];
  for (const rule of rules) {
    // An owner may be a path plus a section (`AGENTS.md § Migration Rule`); check the path.
    const path = rule.owner.split('§')[0].split(' ')[0].trim();
    if (path.includes('/') || path.endsWith('.md')) {
      if (!files.exists(path)) {
        findings.push({
          severity: 'error',
          message: `rule '${rule.id}' names owner '${rule.owner}', whose document ${path} does not exist`,
          ruleId,
        });
      }
    }
  }
  return findings;
}
