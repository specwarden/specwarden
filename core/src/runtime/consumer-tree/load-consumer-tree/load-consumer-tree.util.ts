import { pathToFileURL } from 'node:url';

import type { ICheck, IFileSource, IRule } from '../../../domain';
import { declarationCandidates } from '../../cli/_shared/resolve-declaration/resolve-declaration.util';
import type { ISpecwardenConfig } from '../../config/config.model';
import { loadPlugins } from '../../plugin-loader/plugin-loader.util';
import { CheckDiscoveryError, discoverChecks } from '../discover-checks/discover-checks.util';
import { type ISelfCheckOptions, selfChecks } from '../self-checks/self-checks.factory';
import {
  type IPerimeterModule,
  perimeterDeclaration,
} from '../../perimeter/perimeter-declaration/perimeter-declaration.util';

export interface ILoadedTree {
  /** Every check the run will consider, in a stable order: discovered, then
   * declared in the config, then plugins, then the self-checks. */
  readonly checks: readonly ICheck[];
  readonly rules: readonly IRule[];
  /** What the loader decided and why — files swept, self-checks disabled. */
  readonly notes: readonly string[];
  /** The file each discovered check came from, for a refusal that has to name it. */
  readonly origins: ReadonlyMap<ICheck, string>;
  /** Whether a rule register was declared — by the config, or by `rules.mjs` beside it.
   * Without one the rule audits are off, and `rules` holds only the checks' own. */
  readonly rulesDeclared: boolean;
}

/**
 * Turn a consumer directory into the run's full roster, by convention first and
 * declaration second.
 *
 * ORDER, AND WHY IT IS THIS ORDER. Discovered checks come first because they are the
 * repository's own and a reader expects the tree's order in the report. Declared
 * checks (`config.checks`) follow — the place for something that cannot be a file, a
 * check built from another check's result, say. Plugins next. The engine's
 * self-checks last: they audit everything before them, and a reader who sees the
 * engine complain wants to have already seen what it is complaining about.
 *
 * The self-checks read the roster LAZILY. Their `roster` thunk is evaluated when
 * they run, not when they are built, so the list they audit includes themselves —
 * which matters, because a rule may legitimately name `orphan-check` as its enforcer
 * and a roster read too early reports the engine’s own check as missing.
 *
 * Nothing here knows a check's id or a repository's layout beyond the one directory
 * name it was handed. That is the boundary: the engine loads what it finds; the
 * consumer decides what is there.
 */
/**
 * The rules the checks declare about themselves, assembled into register entries.
 *
 * A rule and the check enforcing it are one fact in two places, joined by a string.
 * The check list already stopped being maintained that way — a check is a file, and
 * the engine reads the folder — while the rule register stayed a hand-kept list
 * beside it — mostly entries naming exactly one check, many naming a check whose id was
 * their own.
 *
 * SEVERAL CHECKS MAY ENFORCE ONE RULE, so entries sharing an id are merged into one
 * rule naming all of them. That is the many-to-one the register always allowed, now
 * expressible without a second list — and the merge is by id, so two checks claiming
 * one id must also agree on its statement; the FIRST wins and the second's text is
 * dropped, which is the same precedence a register with a duplicate entry would have.
 */
function rulesDeclaredOnChecks(checks: readonly ICheck[], register: readonly IRule[]): readonly IRule[] {
  const byId = new Map<string, { rule: IRule; enforcedBy: string[] }>();
  for (const check of checks) {
    if (check.rule === undefined) continue;
    const id = check.rule.id ?? check.id;
    // A rule the factory implied yields to what the consumer wrote: a register entry
    // with its id, or one that already names this check as its enforcer, says what the
    // check enforces here.
    if (check.rule.implied && register.some((r) => r.id === id || enforces(r, check.id))) continue;
    const existing = byId.get(id);
    if (existing) {
      existing.enforcedBy.push(check.id);
      continue;
    }
    byId.set(id, {
      rule: {
        id,
        statement: check.rule.statement,
        // Possibly absent for a check the config built: `rule-owner-resolves` reports it by
        // name rather than letting the register carry a rule nobody can find the reasoning of.
        owner: check.rule.owner as string,
        zone: check.rule.zone ?? check.zone,
        irreversible: check.rule.irreversible,
        enforcement: { enforcedBy: [] },
      },
      enforcedBy: [check.id],
    });
  }
  return [...byId.values()].map(({ rule, enforcedBy }) => ({ ...rule, enforcement: { enforcedBy } }));
}

const enforces = (rule: IRule, checkId: string): boolean =>
  'enforcedBy' in rule.enforcement && rule.enforcement.enforcedBy.includes(checkId);

/**
 * The self-checks’ options, with their tier taken from the repository's vocabulary when the
 * built-in `fast` is not in it. A tier is now held to the vocabulary at registration, and
 * a repository whose rhythm is `pre-commit` / `pr` would otherwise meet its own self-checks
 * refused for naming a tier it never declared.
 */
function selfCheckOptions(config: ISpecwardenConfig): ISelfCheckOptions {
  const declared = typeof config.selfChecks === 'object' ? config.selfChecks : {};
  if (declared.tier !== undefined || config.tiers === undefined || config.tiers.includes('fast')) return declared;
  return { ...declared, tier: config.tiers[0] };
}

/**
 * The policy ids the repository's perimeter declares, or none when it has no perimeter.
 *
 * A perimeter policy is an enforcer the roster never holds: the hook runs it, not the
 * runner. A rule in the register naming one — `no-force-push` — was red on
 * `enforcement-resolves` until the config repeated the perimeter's ids by hand
 * (`enforcers: () => perimeterPolicies.map((p) => p.id)`), a line every repository
 * with a perimeter had to write and nothing but the engine could know. The engine reads
 * the same file the hook reads, so the two cannot disagree about which policies exist.
 *
 * A perimeter that does not load fails `enforcement-resolves`, naming the file — not the
 * whole run. The hook fails open on it, and should; an audit that shrugged would vouch for
 * policies the hook cannot load either.
 */
async function perimeterPolicyIds(files: IFileSource, consumerDir: string): Promise<() => readonly string[]> {
  try {
    const found = await importDeclaration<IPerimeterModule>(files, consumerDir, 'perimeter.mjs');
    const ids = found === undefined ? [] : perimeterDeclaration(found.mod).policies.map((policy) => policy.id);
    return () => ids;
  } catch (error) {
    // Not a load error for the whole run: the hook fails open on this file, and a check
    // that never reads it should not stop over it. The one audit that does read it fails,
    // with the reason — a perimeter that does not load enforces none of its policies.
    const reason = (error as Error).message;
    return () => {
      throw new Error(`${reason} — its policies enforce nothing until it loads`);
    };
  }
}

/** A declaration file beside the config, in either layout, imported — or `undefined`
 * when there is none. One that does not load is a load error naming the file. */
async function importDeclaration<T>(
  files: IFileSource,
  consumerDir: string,
  file: string,
): Promise<{ path: string; mod: T } | undefined> {
  const path = declarationCandidates(consumerDir, file)
    .map((candidate) => candidate.split('\\').join('/'))
    .find((candidate) => files.exists(candidate));
  if (path === undefined) return undefined;
  try {
    return { path, mod: (await import(pathToFileURL(`${files.root()}/${path}`).href)) as T };
  } catch (error) {
    throw new CheckDiscoveryError(`${path} failed to load: ${(error as Error).message}`);
  }
}

/**
 * The rule register from `rules.mjs` beside the config, when the config names none.
 *
 * `init` writes `rules.mjs` and a config that imports it, and a tree written by hand
 * had only the first: the file sat there, read by nothing, and the four rule audits were
 * off — a register that looked declared and was not. Read by convention, as `checks/`
 * and `perimeter.mjs` are. A config that names `rules` itself wins, file or no file.
 */
async function registerFromFile(
  files: IFileSource,
  consumerDir: string,
): Promise<{ path: string; rules: readonly IRule[] } | undefined> {
  const found = await importDeclaration<{ rules?: unknown; default?: unknown }>(files, consumerDir, 'rules.mjs');
  if (found === undefined) return undefined;
  const rules = found.mod.rules ?? found.mod.default;
  if (!Array.isArray(rules)) {
    throw new CheckDiscoveryError(`${found.path} exports no \`rules\` array — export \`const rules = [ … ]\`.`);
  }
  return { path: found.path, rules: rules as readonly IRule[] };
}

/** Who owns the self-checks’ rule when the consumer directory has no README to own it: the
 * engine, named rather than pointed at — not a path, so there is no document to miss. */
const SELF_CHECK_RULE_OWNER = 'the specwarden engine';

export async function loadConsumerTree(
  files: IFileSource,
  consumerDir: string,
  config: ISpecwardenConfig,
): Promise<ILoadedTree> {
  const notes: string[] = [];
  const fromFile = config.rules === undefined ? await registerFromFile(files, consumerDir) : undefined;
  if (fromFile !== undefined) notes.push(`rules read from ${fromFile.path} — the config names none`);
  // The register as the run sees it: the config's, else the file's, else none at all —
  // and "none" still switches the four rule audits off, as it always did.
  const register = config.rules ?? fromFile?.rules;
  const declaredRules = register ?? [];
  // Filled once the self-checks are built: it brings the rule its own checks enforce, and
  // the audits read `rules` through a thunk, so the list they see includes it.
  let rules: readonly IRule[] = declaredRules;

  const discovered =
    config.autoload === false
      ? { checks: [], files: [], origins: new Map<ICheck, string>() }
      : await discoverChecks(files, `${consumerDir}/${config.checksDir ?? 'checks'}`);
  if (discovered.files.length)
    notes.push(
      `discovered ${discovered.checks.length} check(s) in ${discovered.files.length} file(s) under ${consumerDir}/${config.checksDir ?? 'checks'}/`,
    );

  const declared = config.checks ?? [];
  const fromPlugins = loadPlugins(config.plugins ?? []).checks;

  // Filled after the self-checks exist, read through the thunk they hold.
  let roster: ICheck[] = [];
  const perimeterIds = config.selfChecks === false ? () => [] : await perimeterPolicyIds(files, consumerDir);
  const declaredSelfChecks = selfCheckOptions(config);
  const configured = declaredSelfChecks.enforcers;
  const engine =
    config.selfChecks === false
      ? { checks: [], rules: [], notes: ['self-checks disabled entirely (config.selfChecks = false)'] }
      : selfChecks(
          {
            rules: () => rules,
            rulesDeclared: register !== undefined,
            roster: () => roster.map((c) => c.id),
            consumerDir,
          },
          {
            ...declaredSelfChecks,
            // The self-checks’ own rule is owned by the README `init` writes — and a tree
            // written by hand has none, so `rules: []` met a red rule-owner-resolves over
            // machinery the consumer never declared. Without that README the engine owns
            // its own rule; an explicit `ruleOwner` wins over both.
            ruleOwner:
              declaredSelfChecks.ruleOwner ??
              (files.exists(`${consumerDir}/README.md`) ? undefined : SELF_CHECK_RULE_OWNER),
            // The perimeter's ids always count; a config naming more adds to them.
            enforcers: () => [...perimeterIds(), ...(configured?.() ?? [])],
          },
        );
  notes.push(...engine.notes);

  // A consumer that still declares a self-check by hand — the shape every config had
  // before the engine assembled them — would meet a bare "duplicate id" from the
  // roster, which names the symptom and not the fix. Say the fix.
  const selfCheckIds = new Set(engine.checks.map((c) => c.id));
  const redeclared = [...discovered.checks, ...declared, ...fromPlugins]
    .filter((c) => selfCheckIds.has(c.id))
    .map((c) => c.id);
  if (redeclared.length > 0) {
    throw new CheckDiscoveryError(
      `${redeclared.join(', ')}: the engine now builds this check from convention, and the config declares it too. ` +
        `Remove the declaration — or, to keep a hand-tuned one, switch the built-in off with ` +
        `\`selfChecks: { disable: [{ id: '${redeclared[0]}', why: '…' }] }\`.`,
    );
  }

  roster = [...discovered.checks, ...declared, ...fromPlugins, ...engine.checks];
  const colocated = rulesDeclaredOnChecks(roster, declaredRules);

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
  // The self-checks’ own rule joins the declared ones only when the consumer declared a
  // register at all: with no `rules` key the audits are off, and a rule nothing reads
  // would be a declaration for its own sake.
  rules = register === undefined ? declaredRules : [...declaredRules, ...colocated, ...engine.rules];
  return { checks: roster, rules, notes, origins: discovered.origins, rulesDeclared: register !== undefined };
}
