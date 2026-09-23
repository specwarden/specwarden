import type { ICheck, IRule, TTier } from '../../../domain';
import { enforcementResolves } from '../../../checks/enforcement-resolves/enforcement-resolves.check';
import { ratchetDirection } from '../../../checks/ratchet-direction/ratchet-direction.check';
import { ruleCoverage, ruleOwnerResolves } from '../../../checks/rule-coverage/rule-coverage.check';
import { type IForbiddenLiteral, zoneBoundary } from '../../../checks/zone-boundary/zone-boundary.check';
import { orphanCheck } from '../../rules/orphan-check/orphan-check.check';

/**
 * What a consumer may tune about the harness's own checks. Every field is optional;
 * the defaults are the engine's conventions, so a repository that says nothing gets
 * the full set at the paths the engine already knows.
 */
export interface IHarnessOptions {
  /** The tier the self-checks run in. They are cheap, so the fastest one. */
  readonly tier?: TTier;
  /** Glob of the ratchet store. Default: `<consumerDir>/ratchets/*.json`. */
  readonly ratchetFiles?: string;
  /** Ratchets that may never exceed a value, by id. */
  readonly ceilings?: Readonly<Record<string, number>>;
  /** The tolerated count of rules declared unenforced without a reason. Default 0. */
  readonly ruleCoverageRatchet?: number;
  /** Ids that count as enforcers beside the registered checks — perimeter rule ids,
   * typically. Read lazily, since the perimeter may load after the checks. */
  readonly otherEnforcerIds?: () => readonly string[];
  /**
   * Enable the zone barrier over a product tree in THIS repository. Absent by
   * default: most consumers do not host the engine's source, and a barrier over a
   * tree that does not exist is a check that cannot fail.
   */
  readonly zone?: {
    readonly productSources: string;
    readonly except?: readonly string[];
    readonly forbiddenLiterals: readonly IForbiddenLiteral[];
    readonly consumerImport?: string | RegExp;
  };
  /** Self-checks to leave out, by id, each with a reason. Reported, never silent. */
  readonly disable?: readonly { readonly id: string; readonly why: string }[];
  /**
   * The document that owns the harness's own rule. Defaults to the consumer
   * directory's README, which `init` writes — so the owner resolves on day one.
   */
  readonly ruleOwner?: string;
}

export interface IHarnessInputs {
  readonly rules: () => readonly IRule[];
  /**
   * Whether the consumer DECLARED a rule registry at all. `rules: []` is a declaration
   * (an empty registry, audited as one); a config with no `rules` key is not, and the
   * four rule audits are left out — a repository on day one, with checks and no rules
   * yet, would otherwise meet a red `orphan-check` for the checks it just enabled and
   * learn that the tool punishes starting.
   */
  readonly rulesDeclared: boolean;
  /** Every registered check id — read lazily, because this list includes the checks
   * built here, and a list read too early counts the harness's own checks as absent. */
  readonly checkIds: () => readonly string[];
  readonly consumerDir: string;
}

/** The self-check ids, so a consumer can name one in `disable` without guessing. */
export const HARNESS_CHECK_IDS = [
  'rule-owner-resolves',
  'rule-coverage',
  'orphan-check',
  'enforcement-resolves',
  'ratchet-direction',
  'zone-boundary',
] as const;

/** The id of the rule the harness declares for its own checks — doctor names it apart. */
export const HARNESS_RULE_ID = 'harness-integrity';

/**
 * The checks the harness runs on ITSELF, assembled from convention.
 *
 * These used to be written out by every consumer: six factory calls, each with an id,
 * a title, a tier, a hint, and a lazily-read list of check ids — about a hundred lines
 * that were identical in every repository that adopted the engine, because they
 * describe the engine and not the repository. A consumer that forgot one had a
 * harness with a hole in it and no way to see the hole.
 *
 * Now they exist unless switched off, and switching one off requires a reason that
 * the run reports. The consumer supplies only what is genuinely its own: ceilings,
 * a product tree if it hosts one, and any enforcer ids the engine cannot see.
 */
export function harnessChecks(
  inputs: IHarnessInputs,
  options: IHarnessOptions = {},
): { checks: readonly ICheck[]; rules: readonly IRule[]; notes: readonly string[] } {
  const tier = options.tier ?? 'fast';
  const disabled = new Map((options.disable ?? []).map((d) => [d.id, d.why]));
  const notes: string[] = [];

  const ruleAudits: ICheck[] = [
    ruleOwnerResolves({
      id: 'rule-owner-resolves',
      title: 'every declared rule names an owner document that exists',
      tier,
      rules: inputs.rules,
      hint: 'Point the rule at the document that owns it, or restore the missing document.',
    }),
    ruleCoverage({
      id: 'rule-coverage',
      title: 'no rule is declared unenforced without a reason (ratcheted, only turns down)',
      tier,
      rules: inputs.rules,
      ratchetId: 'rule-coverage',
      ratchet: options.ruleCoverageRatchet ?? 0,
      hint: 'Enforce the rule with a check, or state why it cannot be mechanized — a reason, never an apology.',
    }),
    orphanCheck({ checkIds: inputs.checkIds, rules: inputs.rules, advisory: false, tier }),
    enforcementResolves({
      id: 'enforcement-resolves',
      title: 'every enforcer a declared rule names actually exists',
      tier,
      rules: inputs.rules,
      checkIds: inputs.checkIds,
      otherEnforcerIds: options.otherEnforcerIds,
      hint:
        'Point the rule at an enforcer that exists — a registered check id, or another declared enforcer. ' +
        'If nothing enforces it, say so with `notMechanizable` and a reason.',
    }),
  ];
  if (!inputs.rulesDeclared) {
    notes.push(
      'no `rules` declared — the four rule audits (owner, coverage, orphans, enforcers) are not registered; add `rules: []` to start one.',
    );
  }

  const all: ICheck[] = [
    ...(inputs.rulesDeclared ? ruleAudits : []),
    ratchetDirection({
      id: 'ratchet-direction',
      title: 'a persisted ratchet is well-formed and never sits above its declared ceiling',
      tier,
      ratchetFiles: options.ratchetFiles ?? `${inputs.consumerDir}/ratchets/*.json`,
      ceilings: options.ceilings,
      hint: 'Lower the ratchet file, or raise the ceiling deliberately. A ratchet only turns down: `specwarden check --tighten`.',
    }),
  ];

  if (options.zone) {
    all.push(
      zoneBoundary({
        id: 'zone-boundary',
        title: 'a product source names no host literal and never imports the consumer zone',
        tier,
        productSources: options.zone.productSources,
        except: options.zone.except,
        forbiddenLiterals: options.zone.forbiddenLiterals,
        consumerImport: options.zone.consumerImport,
        hint: 'A product source must survive renaming the project: move the repository fact into the consumer zone.',
      }),
    );
  }

  for (const [id, why] of disabled) {
    if (!all.some((c) => c.id === id)) {
      notes.push(`harness check '${id}' is disabled but no self-check has that id — nothing was switched off.`);
      continue;
    }
    notes.push(`harness check '${id}' disabled: ${why}`);
  }

  const checks = all.filter((c) => !disabled.has(c.id));

  /**
   * The harness obeys its own asymmetry.
   *
   * `orphan-check` fails a check that enforces no declared rule — and the self-checks
   * are checks. Without this they are orphans on the first run of a fresh repository,
   * which is a harness reporting its own machinery as a defect: the worst possible
   * first impression, and one nobody can act on.
   *
   * A rule, not an exemption. Exempting them would put a hole in the very audit that
   * exists to find holes; declaring the rule says out loud what these checks are FOR,
   * and leaves them subject to every other audit exactly like any other check.
   */
  const rules: IRule[] = checks.length
    ? [
        {
          id: HARNESS_RULE_ID,
          statement:
            'Every rule names an owner document that exists and an enforcer that exists; a check enforces a declared rule; a ratchet only turns down.',
          owner: options.ruleOwner ?? `${inputs.consumerDir}/README.md`,
          enforcement: { checkIds: checks.map((c) => c.id) },
        },
      ]
    : [];

  return { checks, rules, notes };
}
