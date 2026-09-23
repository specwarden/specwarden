import type { IFileSource, IFinding, IRule } from '../../../domain';

/** `@scope/name`, as npm spells a scoped package. A path in that shape (`@docs/rules.md`)
 * is not exempted by it: the name must also be one the manifest depends on. */
const SCOPED_PACKAGE = /^@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*$/;

/** The packages the repository's root manifest names, in any dependency field. */
function dependsOn(files: IFileSource): ReadonlySet<string> {
  const text = files.tryRead('package.json');
  if (text === undefined) return new Set();
  try {
    const manifest = JSON.parse(text) as Record<string, Record<string, unknown> | undefined>;
    const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    return new Set(fields.flatMap((field) => Object.keys(manifest[field] ?? {})));
  } catch {
    return new Set();
  }
}

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
export function ruleOwnerFindings(
  rules: readonly IRule[],
  files: IFileSource,
  ruleId = 'rule-owner-resolves',
): readonly IFinding[] {
  const findings: IFinding[] = [];
  for (const rule of rules) {
    // A rule with no owner at all is a finding, not a crash: `owner` is required in the
    // type, and a rule written in JavaScript (or a check built outside discovery, where no
    // file can own it) arrives without one — and this read `undefined.split`, failing
    // the audit with a TypeError that named neither the rule nor the fix.
    if (typeof rule.owner !== 'string') {
      findings.push({
        severity: 'error',
        message: `rule '${rule.id}' names no owner — say which document holds its reasoning (\`owner: 'docs/RULES.md'\`).`,
        ruleId,
      });
      continue;
    }
    // An owner may be a path plus a section (`AGENTS.md § Releases`); check the path.
    const path = rule.owner.split('§')[0].split(' ')[0].trim();
    // A scoped package owns the rule its checks imply — `@specwarden/docs` — and its
    // reasoning ships in that package, not in a document this repository holds. Only a
    // package the repository DEPENDS on: any `@x/y` would let a typo'd path pass.
    if (SCOPED_PACKAGE.test(path) && dependsOn(files).has(path)) continue;
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
