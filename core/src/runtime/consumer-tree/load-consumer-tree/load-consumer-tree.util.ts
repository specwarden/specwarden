import type { ICheck, IFileSource, IRule } from '../../../domain';
import type { IWardenConfig } from '../../config/config.model';
import { loadPlugins } from '../../plugin-loader/plugin-loader.util';
import { CheckDiscoveryError, discoverChecks } from '../discover-checks/discover-checks.util';
import { harnessChecks } from '../harness-checks/harness-checks.factory';

export interface ILoadedTree {
  /** Every check the run will consider, in a stable order: discovered, then
   * declared in the config, then plugins, then the harness's own. */
  readonly checks: readonly ICheck[];
  readonly rules: readonly IRule[];
  /** What the loader decided and why — files swept, self-checks disabled. */
  readonly notes: readonly string[];
}

/**
 * Turn a consumer directory into the run's full roster, by convention first and
 * declaration second.
 *
 * ORDER, AND WHY IT IS THIS ORDER. Discovered checks come first because they are the
 * repository's own and a reader expects the tree's order in the report. Declared
 * checks (`config.checks`) follow — the place for something that cannot be a file, a
 * check built from another check's result, say. Plugins next. The harness's own
 * self-checks last: they audit everything before them, and a reader who sees the
 * harness complain wants to have already seen what it is complaining about.
 *
 * The self-checks read the roster LAZILY. Their `checkIds` thunk is evaluated when
 * they run, not when they are built, so the list they audit includes themselves —
 * which matters, because a rule may legitimately name `orphan-check` as its enforcer
 * and a roster read too early reports the harness's own check as missing.
 *
 * Nothing here knows a check's id or a repository's layout beyond the one directory
 * name it was handed. That is the boundary: the engine loads what it finds; the
 * consumer decides what is there.
 */
/**
 * The rules the checks declare about themselves, assembled into register entries.
 *
 * A rule and the check enforcing it are one fact in two places, joined by a string.
 * The gate list already stopped being maintained that way — a check is a file, and
 * the engine reads the folder — while the rule register stayed a hand-kept list
 * beside it, and the first consumer's grew to 99 entries of which 68 named exactly
 * one check and 34 named a check whose id was their own.
 *
 * SEVERAL CHECKS MAY ENFORCE ONE RULE, so entries sharing an id are merged into one
 * rule naming all of them. That is the many-to-one the register always allowed, now
 * expressible without a second list — and the merge is by id, so two checks claiming
 * one id must also agree on its statement; the FIRST wins and the second's text is
 * dropped, which is the same precedence a register with a duplicate entry would have.
 */
function rulesDeclaredOnChecks(checks: readonly ICheck[]): readonly IRule[] {
  const byId = new Map<string, { rule: IRule; checkIds: string[] }>();
  for (const check of checks) {
    if (check.rule === undefined) continue;
    const id = check.rule.id ?? check.id;
    const existing = byId.get(id);
    if (existing) {
      existing.checkIds.push(check.id);
      continue;
    }
    byId.set(id, {
      rule: {
        id,
        statement: check.rule.statement,
        owner: check.rule.owner,
        zone: check.rule.zone ?? check.zone,
        irreversible: check.rule.irreversible,
        enforcement: { checkIds: [] },
      },
      checkIds: [check.id],
    });
  }
  return [...byId.values()].map(({ rule, checkIds }) => ({ ...rule, enforcement: { checkIds } }));
}

export async function loadConsumerTree(
  files: IFileSource,
  consumerDir: string,
  config: IWardenConfig,
): Promise<ILoadedTree> {
  const notes: string[] = [];
  const declaredRules = config.rules ?? [];
  // Filled once the harness is built: it brings the rule its own checks enforce, and
  // the audits read `rules` through a thunk, so the list they see includes it.
  let rules: readonly IRule[] = declaredRules;

  const discovered =
    config.autoload === false
      ? { checks: [], files: [] }
      : await discoverChecks(files, `${consumerDir}/${config.checksDir ?? 'checks'}`);
  if (discovered.files.length)
    notes.push(
      `discovered ${discovered.checks.length} check(s) in ${discovered.files.length} file(s) under ${consumerDir}/${config.checksDir ?? 'checks'}/`,
    );

  const declared = config.checks ?? [];
  const fromPlugins = loadPlugins(config.plugins ?? []).checks;

  // Filled after the harness checks exist, read through the thunk they hold.
  let roster: ICheck[] = [];
  const harness =
    config.harness === false
      ? { checks: [], rules: [], notes: ['harness self-checks disabled entirely (config.harness = false)'] }
      : harnessChecks(
          {
            rules: () => rules,
            rulesDeclared: config.rules !== undefined,
            checkIds: () => roster.map((c) => c.id),
            consumerDir,
          },
          typeof config.harness === 'object' ? config.harness : {},
        );
  notes.push(...harness.notes);

  // A consumer that still declares a self-check by hand — the shape every config had
  // before the harness assembled them — would meet a bare "duplicate id" from the
  // registry, which names the symptom and not the fix. Say the fix.
  const harnessIds = new Set(harness.checks.map((c) => c.id));
  const redeclared = [...discovered.checks, ...declared, ...fromPlugins]
    .filter((c) => harnessIds.has(c.id))
    .map((c) => c.id);
  if (redeclared.length > 0) {
    throw new CheckDiscoveryError(
      `${redeclared.join(', ')}: the engine now builds this check from convention, and the config declares it too. ` +
        `Remove the declaration — or, to keep a hand-tuned one, switch the built-in off with ` +
        `\`harness: { disable: [{ id: '${redeclared[0]}', why: '…' }] }\`.`,
    );
  }

  roster = [...discovered.checks, ...declared, ...fromPlugins, ...harness.checks];
  const colocated = rulesDeclaredOnChecks(roster);

  /**
   * One id, one declaration. A rule stated on a check AND in the register is two
   * statements of one assertion that can disagree about its wording, its owner or
   * whether it is irreversible — and nothing downstream would notice: the coverage
   * number counts both, and every audit walks whichever copy it reaches first.
   *
   * It is a refusal rather than a merge because there is no correct merge. The two
   * copies are equally entitled, and picking one silently is how the OTHER one's
   * wording — the one somebody edited last — stops being true without ever being
   * deleted. It happened on the first migration that used this: `router-mirror` moved
   * onto its check and stayed in the register, and every audit still passed.
   */
  const duplicated = colocated.filter((r) => declaredRules.some((d) => d.id === r.id)).map((r) => r.id);
  if (duplicated.length > 0) {
    throw new CheckDiscoveryError(
      `${duplicated.join(', ')}: declared BOTH on a check (\`rule: { … }\`) and in the rule register. ` +
        'One id, one declaration — delete the register entry, or drop the `rule` from the check and keep the register as its owner.',
    );
  }
  if (colocated.length) notes.push(`${colocated.length} rule(s) declared on the checks that enforce them`);
  // The harness's own rule joins the declared ones only when the consumer declared a
  // registry at all: with no `rules` key the audits are off, and a rule nothing reads
  // would be a declaration for its own sake.
  rules = config.rules === undefined ? declaredRules : [...declaredRules, ...colocated, ...harness.rules];
  return { checks: roster, rules, notes };
}
