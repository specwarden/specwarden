import type { TCapability } from '../../../domain';

/**
 * Thrown when a check uses a port it did not declare the capability for. The
 * engine hands a non-`exec` check a process runner whose every method throws
 * this, so an undeclared power is a loud runtime refusal rather than a silent
 * escalation. Naming the member that was called makes the fix obvious: either
 * declare the capability, or stop reaching for it.
 */
export class CapabilityError extends Error {
  override readonly name = 'CapabilityError';
  constructor(
    readonly checkId: string,
    readonly needed: TCapability,
    readonly member: string,
  ) {
    super(
      `check '${checkId}' used a '${needed}' capability it did not declare ` +
        `(called ${member}). Add '${needed}' to the check's capabilities list, ` +
        `or stop using it — the engine denies what a check did not ask for.`,
    );
  }
}
