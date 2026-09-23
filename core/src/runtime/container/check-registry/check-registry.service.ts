import { CHECK_CONTRACT_VERSION, type ICheck, type TTier } from '../../../domain';
import { UNNAMED_CHECK_ID } from '../../../primitives/_shared';

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
 * Refused when a check was built with no `id` and nothing named it. Only discovery can
 * supply one — a file exporting a single check is that check's name — so a check built
 * anywhere else (the config's `checks`, a plugin) must say its own.
 */
export class UnnamedCheckError extends Error {
  override readonly name = 'UnnamedCheckError';
  constructor(readonly title: string) {
    super(
      `a check with no \`id\` was registered${title !== UNNAMED_CHECK_ID ? ` ('${title}')` : ''}. Give it one — or export it ` +
        'alone from its own *.check.mjs file under checks/, where it takes the file’s name.',
    );
  }
}

/**
 * Refused when a check names a tier the repository does not declare.
 *
 * A factory cannot know a repository's custom tiers, so this is decided where the
 * registry is built, against the config's vocabulary. It used to load: `tier: 'fastt'`
 * ran under `--all` and was in no schedule — every `--tier` skipped it in silence, which
 * is a gate nothing runs reporting nothing.
 */
export class UnknownTierError extends Error {
  override readonly name = 'UnknownTierError';
  constructor(
    readonly checkId: string,
    readonly tier: string,
    readonly tiers: readonly string[],
    origin?: string,
  ) {
    super(
      `check '${checkId}'${origin ? ` (${origin})` : ''} declares tier "${tier}" — expected one of: ${tiers.join(', ')}. ` +
        'A tier outside the vocabulary is in no schedule, so no `--tier` would ever run it.',
    );
  }
}

export interface ICheckRegistryOptions {
  /** The tiers a check may name — the config's `tiers`. Absent: any tier is accepted. */
  readonly tiers?: readonly string[];
  /** Where a check came from, so a refusal can name the file. */
  readonly originOf?: (check: ICheck) => string | undefined;
}

/**
 * The set of checks the engine knows about. Registration is where the contract
 * version is enforced, duplicate ids are refused, an unnamed check is refused and a
 * tier is held to the repository's vocabulary; nothing else validates a check.
 * Insertion order is preserved so the runner's output order is the order checks were
 * registered — a reproducible tier manifest depends on it.
 */
export class CheckRegistry {
  private readonly checks = new Map<string, ICheck>();

  constructor(private readonly options: ICheckRegistryOptions = {}) {}

  register(check: ICheck): void {
    if (check.contractVersion !== CHECK_CONTRACT_VERSION) {
      throw new CheckContractVersionError(check.id, check.contractVersion);
    }
    if (check.id === UNNAMED_CHECK_ID) {
      throw new UnnamedCheckError(check.title);
    }
    const tiers = this.options.tiers;
    if (tiers !== undefined && !tiers.includes(check.tier)) {
      throw new UnknownTierError(check.id, check.tier, tiers, this.options.originOf?.(check));
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

  /** The file a registered check came from, when the registry was told. */
  originOf(check: ICheck): string | undefined {
    return this.options.originOf?.(check);
  }
}
