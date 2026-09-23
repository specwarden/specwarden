import type { ICheck, ICheckIdentity, ICheckMeta, IFinding, TRatchetDirection } from '../../domain';
import { buildCheck, verdictFrom } from '../../primitives/_shared';

export interface IRatchetDirectionOptions extends ICheckIdentity {
  /** Glob of the persisted ratchet files (one JSON per check id). */
  readonly ratchetFiles: string;
  /**
   * Ceilings the ROSTER cannot supply, by id — a ratchet no registered check
   * declares, or one whose tolerated value lives somewhere the check does not state.
   *
   * It used to be the only source, and that made it a second copy of every ceiling
   * the checks already declared inline: two lists describing one fact, kept in step
   * by whoever remembered, in a consumer's config file. A check that declares
   * `ratchet: <n>` is now read straight off the manifest, and anything named here
   * OVERRIDES that — which is the right precedence, because a value stated here was
   * stated deliberately and later.
   */
  readonly ceilings?: Readonly<Record<string, number>>;
}

/** The basename of a path without its `.json` extension — the id a ratchet file
 * claims to hold. */
function idOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base.endsWith('.json') ? base.slice(0, -'.json'.length) : base;
}

/** Every ceiling the run can see: what each check declares inline, overridden by what
 * the consumer named explicitly. */
function ceilingsFrom(
  roster: readonly ICheckMeta[],
  declared: Readonly<Record<string, number>> | undefined,
): Map<string, { ceiling: number; direction: TRatchetDirection }> {
  const out = new Map<string, { ceiling: number; direction: TRatchetDirection }>();
  for (const check of roster) {
    if (check.ratchet?.ceiling === undefined) continue;
    out.set(check.ratchet.id, { ceiling: check.ratchet.ceiling, direction: check.ratchet.direction ?? 'down' });
  }
  for (const [id, ceiling] of Object.entries(declared ?? {})) {
    out.set(id, { ceiling, direction: out.get(id)?.direction ?? 'down' });
  }
  return out;
}

/**
 * A ratchet only turns one way, and this check guards the invariant AT REST — not
 * at the moment of a write (the store already refuses to loosen one there), but
 * against a hand-edit that moves a stored value past what its check tolerates. It
 * also refuses a CORRUPT ratchet: a file that will not parse, whose value is not a
 * non-negative integer, or whose stored id contradicts its filename is a silent
 * hole where "the debt is capped" quietly stops being true.
 *
 * WHICH WAY IS WRONG depends on the ratchet. A debt count may not rise above its
 * ceiling; a score floor may not fall below it. The direction is the one the check
 * declares, so a floor stops having to be kept outside the mechanism — validating its
 * own JSON by hand, and covered by this audit not at all.
 *
 * A PRODUCT check: reading and validating a store of ratchets is universal; WHERE
 * the store lives is an option the consumer supplies, and the thresholds come from
 * the checks themselves.
 */
export function ratchetDirection(options: IRatchetDirectionOptions): ICheck {
  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx) => {
    const findings: IFinding[] = [];
    const ceilings = ceilingsFrom(ctx.roster(), options.ceilings);

    for (const file of ctx.files.glob(options.ratchetFiles)) {
      const fileId = idOf(file);

      let parsed: unknown;
      try {
        parsed = JSON.parse(ctx.files.read(file));
      } catch (error) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} is not valid JSON: ${(error as Error).message}. A ratchet that will not parse caps nothing.`,
          ruleId: options.id,
        });
        continue;
      }

      const record = parsed as { id?: unknown; value?: unknown };
      if (record.id !== undefined && record.id !== fileId) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} declares id \`${String(record.id)}\` but its filename is \`${fileId}\` — the store is keyed by filename, so the two must agree.`,
          ruleId: options.id,
        });
      }

      const value = record.value;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} has value \`${String(value)}\` — a ratchet is a non-negative integer.`,
          ruleId: options.id,
        });
        continue;
      }

      const declared = ceilings.get(fileId);
      if (declared === undefined) continue;
      if (declared.direction === 'up' && value < declared.ceiling) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} is ${value}, below the floor ${declared.ceiling} its check declares — this ratchet only turns up. Raise the file, or lower the check's declared floor deliberately.`,
          ruleId: options.id,
        });
        continue;
      }
      if (declared.direction === 'down' && value > declared.ceiling) {
        findings.push({
          severity: 'error',
          file,
          message: `${file} is ${value}, above the ceiling ${declared.ceiling} its check declares — a ratchet only turns down. Lower the file, or raise the check's declared ceiling deliberately.`,
          ruleId: options.id,
        });
      }
    }
    return verdictFrom(findings, ctx.ratchet);
  });
}
