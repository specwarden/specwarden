import {
  CHECK_CONTRACT_VERSION,
  type ICheck,
  type ICheckContext,
  type ICheckIdentity,
  type IVerdict,
  type TCapability,
  resolveWhen,
} from '../../../domain';

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
 */
export function buildCheck(
  identity: ICheckIdentity,
  capabilities: readonly TCapability[],
  run: (ctx: ICheckContext) => IVerdict | Promise<IVerdict>,
  // A factory that computes its own predicate passes one; everything else gets the
  // identity's, resolved here so no factory has to remember.
  when?: (changed: readonly string[]) => boolean,
): ICheck {
  return {
    id: identity.id,
    title: identity.title,
    tier: identity.tier,
    zone: identity.zone ?? 'consumer',
    capabilities,
    contractVersion: CHECK_CONTRACT_VERSION,
    advisory: identity.advisory,
    exclusive: identity.exclusive,
    hint: identity.hint,
    timeoutSec: identity.timeoutSec,
    rule: identity.rule,
    ratchet:
      identity.ratchetId !== undefined
        ? { id: identity.ratchetId, direction: identity.ratchetDirection, ceiling: identity.ratchet }
        : undefined,
    when: when ?? resolveWhen(identity.when),
    run,
  };
}
