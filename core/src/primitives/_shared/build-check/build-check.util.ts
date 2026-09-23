import {
  CHECK_CONTRACT_VERSION,
  type ICheck,
  type ICheckContext,
  type ICheckDeclaration,
  type ICheckRule,
  type IVerdict,
  type TCapability,
  resolveWhen,
} from '../../../domain';

/**
 * The id a check carries until something names it.
 *
 * A factory accepts a missing id because discovery can supply one: a file exporting a
 * single check is named after itself. Anywhere else nothing can, so the registry refuses
 * a check still carrying this, by name. It is not a usable id on purpose — angle brackets
 * are not in the id grammar — so no author can write it by accident and slip past.
 */
export const UNNAMED_CHECK_ID = '<unnamed>';

/** A rule as a check file may write it — the statement alone, or the whole object. */
export function normaliseRule(rule: string | ICheckRule | undefined): ICheckRule | undefined {
  return typeof rule === 'string' ? { statement: rule } : rule;
}

/**
 * Assemble the ICheck an identity + capabilities + logic describe.
 *
 * Every factory in the product goes through here, which is what makes the four
 * fields nobody wants to think about — the zone, the contract version, the ratchet
 * record, the isolation flag — impossible to forget in one factory and remember in
 * the next. A check FILE that hand-writes an object literal instead is writing all
 * four itself, and one of them silently rots: a literal `contractVersion: 1` keeps
 * loading after the contract bumps, which is the one failure the version exists to
 * prevent.
 *
 * THE DEFAULTS, each one the engine can know: `tier` is `fast`; `title` is the rule's
 * statement, else the id; the ratchet's id is the check's own when a `ratchet` is
 * declared without one — the docblock said so for as long as the code did not, and a
 * `--tighten` over such a check wrote nothing the audit could read.
 *
 * `run` receives the built check as its second argument, and a body reads its id from
 * there rather than from the options it closed over: the id may be supplied after the
 * factory ran (by the file name), and a finding attributed to the options' `undefined`
 * would be attributed to nothing.
 */
export function buildCheck(
  identity: ICheckDeclaration,
  capabilities: readonly TCapability[],
  run: (ctx: ICheckContext, self: ICheck) => IVerdict | Promise<IVerdict>,
  // A factory that computes its own predicate passes one; everything else gets the
  // identity's, resolved here so no factory has to remember.
  when?: (changed: readonly string[]) => boolean,
): ICheck {
  const id = identity.id ?? UNNAMED_CHECK_ID;
  const rule = normaliseRule(identity.rule);
  const ratcheted = identity.ratchetId !== undefined || identity.ratchet !== undefined;
  const check: ICheck = {
    id,
    title: identity.title ?? rule?.statement ?? id,
    tier: identity.tier ?? 'fast',
    zone: identity.zone ?? 'consumer',
    capabilities,
    contractVersion: CHECK_CONTRACT_VERSION,
    advisory: identity.advisory,
    exclusive: identity.exclusive,
    hint: identity.hint,
    timeoutSec: identity.timeoutSec,
    rule,
    ratchet: ratcheted
      ? { id: identity.ratchetId ?? id, direction: identity.ratchetDirection, ceiling: identity.ratchet }
      : undefined,
    when: when ?? resolveWhen(identity.when),
    run: (ctx) => run(ctx, check),
  };
  return check;
}

/**
 * Give a check the name and the rule owner its FILE supplies, where the check did not
 * say. Called by discovery, and only for what was left out: an id the author wrote, or
 * an owner they named, is never replaced.
 *
 * It edits the check in place, because the body reads its id from the check it was
 * built into — a copy would be named while its findings stayed attributed to nobody.
 */
export function nameFromFile(check: ICheck, file: { readonly id?: string; readonly owner: string }): ICheck {
  const target = check as { -readonly [K in keyof ICheck]: ICheck[K] };
  if (file.id !== undefined && check.id === UNNAMED_CHECK_ID) {
    target.id = file.id;
    if (check.title === UNNAMED_CHECK_ID) target.title = file.id;
    if (check.ratchet?.id === UNNAMED_CHECK_ID) target.ratchet = { ...check.ratchet, id: file.id };
  }
  const rule = normaliseRule(check.rule as string | ICheckRule | undefined);
  if (rule !== undefined && (rule.owner === undefined || rule !== check.rule)) {
    target.rule = { ...rule, owner: rule.owner ?? file.owner };
  }
  return check;
}
