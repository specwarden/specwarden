import { CHECK_CONTRACT_VERSION, type ICheck, type TTier } from '../../../domain';

/**
 * Refused at registration when a check was built against an incompatible major
 * version of the check contract. The point is a legible failure HERE, at load,
 * rather than an obscure one deep inside the check's `run` when a field it
 * expected is missing.
 */
export class CheckContractVersionError extends Error {
  override readonly name = 'CheckContractVersionError';
  constructor(
    readonly checkId: string,
    readonly declared: number,
  ) {
    super(
      `check '${checkId}' was built against check-contract v${declared}, but this ` +
        `engine speaks v${CHECK_CONTRACT_VERSION}. Rebuild the check against the ` +
        `current contract, or pin an engine that matches.`,
    );
  }
}

/** Refused when two checks claim the same id — a collision would make one of them
 * unreachable, silently. */
export class DuplicateCheckError extends Error {
  override readonly name = 'DuplicateCheckError';
  constructor(readonly checkId: string) {
    super(`two checks declare id '${checkId}'. Ids are the runner's address for a check; they must be unique.`);
  }
}

/**
 * The set of checks the engine knows about. Registration is where the contract
 * version is enforced and duplicate ids are refused; nothing else validates a
 * check. Insertion order is preserved so the runner's output order is the order
 * checks were registered — a reproducible tier manifest depends on it.
 */
export class CheckRegistry {
  private readonly checks = new Map<string, ICheck>();

  register(check: ICheck): void {
    if (check.contractVersion !== CHECK_CONTRACT_VERSION) {
      throw new CheckContractVersionError(check.id, check.contractVersion);
    }
    if (this.checks.has(check.id)) {
      throw new DuplicateCheckError(check.id);
    }
    this.checks.set(check.id, check);
  }

  registerAll(checks: Iterable<ICheck>): void {
    for (const check of checks) this.register(check);
  }

  all(): readonly ICheck[] {
    return [...this.checks.values()];
  }

  byId(id: string): ICheck | undefined {
    return this.checks.get(id);
  }

  forTier(tier: TTier): readonly ICheck[] {
    return this.all().filter((c) => c.tier === tier);
  }
}
