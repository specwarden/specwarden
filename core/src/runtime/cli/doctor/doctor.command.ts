import { computeCoverage, validateOwnership } from '../../../domain';
import type { IOwnershipFinding, IRule, TCapability } from '../../../domain';
import type { CheckRegistry } from '../../container';
import { HARNESS_RULE_ID } from '../../consumer-tree/harness-checks/harness-checks.factory';
import { orphanChecks } from '../../rules';
import type { IWardenConfig } from '../../config/config.model';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/** The shape of `doctor --json`, stated in the document: a script reads it before the rest,
 * and a key removed or renamed moves this number. */
const DOCTOR_REPORT_VERSION = 1;

/** One check, as doctor describes it — the text line and the JSON row read the same. */
interface IDoctorCheck {
  readonly id: string;
  readonly title: string;
  readonly tier: string;
  readonly zone: string;
  readonly capabilities: readonly TCapability[];
  readonly denied: boolean;
  readonly advisory: boolean;
  readonly exclusive: boolean;
  readonly origin?: string;
  readonly rule?: { readonly statement: string; readonly owner?: string; readonly implied: boolean };
}

/** Everything doctor reports, computed once — so `--json` cannot say something the text does not. */
interface IDoctorReport {
  readonly checks: readonly IDoctorCheck[];
  readonly denyCapabilities: readonly TCapability[];
  readonly ownership?: { readonly roles: Readonly<Record<string, string>>; readonly conflicts: readonly string[] };
  readonly rules?: {
    readonly declared: number;
    /** The rules the engine declares for its own checks — counted, and named, apart. */
    readonly engine: readonly string[];
    readonly enforced: number;
    readonly notMechanizable: number;
    readonly unenforcedWithoutReason: number;
    readonly orphans: readonly string[];
  };
}

function report(config: IWardenConfig, registry: CheckRegistry): IDoctorReport {
  const denied = new Set(config.denyCapabilities ?? []);
  const checks = registry.all().map((c): IDoctorCheck => ({
    id: c.id,
    title: c.title,
    tier: c.tier,
    zone: c.zone,
    capabilities: c.capabilities,
    denied: c.capabilities.some((cap) => denied.has(cap)),
    advisory: Boolean(c.advisory),
    exclusive: Boolean(c.exclusive),
    origin: registry.originOf(c),
    rule:
      c.rule === undefined
        ? undefined
        : { statement: c.rule.statement, owner: c.rule.owner, implied: Boolean(c.rule.implied) },
  }));

  const ownership =
    config.ownership === undefined
      ? undefined
      : {
          roles: config.ownership as Readonly<Record<string, string>>,
          conflicts: validateOwnership(config.ownership, config.specSource ? [config.specSource.name] : []).map(
            (finding: IOwnershipFinding) => finding.message,
          ),
        };

  const declared: readonly IRule[] = config.rules ?? [];
  const cov = computeCoverage(declared);
  const rules =
    declared.length === 0
      ? undefined
      : {
          declared: cov.total,
          engine: declared.filter((r) => r.id === HARNESS_RULE_ID).map((r) => r.id),
          enforced: cov.enforced,
          notMechanizable: cov.notMechanizable,
          unenforcedWithoutReason: cov.unenforcedWithoutReason,
          orphans: orphanChecks(
            registry.all().map((c) => c.id),
            declared,
          ),
        };

  return { checks, denyCapabilities: [...denied], ownership, rules };
}

/**
 * `doctor` — what this repository has DECLARED, printed without running any of it.
 *
 * It answers the question a red gate cannot: not "does the code pass" but "is the
 * harness itself wired". Every line is read from the config and the registry, so a
 * check that exists but enforces no rule, an ownership conflict, or a capability the
 * config denies out from under a check, all show up here rather than as a surprise
 * mid-run.
 *
 * `--json` is the same report as one document, for a dashboard or a script: `--json` was
 * accepted and ignored, and the text was all a tool had to parse. The exit code is the
 * same either way — 1 on an ownership conflict.
 */
export function doctor(
  config: IWardenConfig,
  registry: CheckRegistry,
  io: ICliIo,
  options: { readonly json?: boolean } = {},
): number {
  const r = report(config, registry);
  const failed = (r.ownership?.conflicts.length ?? 0) > 0;
  if (options.json) {
    io.out(`${JSON.stringify({ version: DOCTOR_REPORT_VERSION, ...r }, null, 2)}\n`);
    return failed ? 1 : 0;
  }

  for (const c of r.checks) {
    const caps = c.capabilities.length ? c.capabilities.join(',') : '—';
    // The three things a reader asks doctor about one check, beyond its id: does it block,
    // does it need the machine to itself, and which file do I open to change it.
    const flags = `${c.denied ? ' DENIED' : ''}${c.advisory ? ' advisory' : ''}${c.exclusive ? ' exclusive' : ''}`;
    io.out(`${c.id}\t${c.tier}\t${c.zone}\t[${caps}]${flags}\t${c.title}${c.origin ? `\t${c.origin}` : ''}\n`);
  }
  if (r.denyCapabilities.length) io.out(`\ndenyCapabilities: ${r.denyCapabilities.join(', ')}\n`);

  if (r.ownership) {
    io.out('\nownership:\n');
    for (const [role, owner] of Object.entries(r.ownership.roles)) io.out(`  ${role}: ${owner}\n`);
    for (const message of r.ownership.conflicts) io.err(`  ⚠ ownership conflict: ${message}\n`);
    if (failed) return 1;
  }

  if (r.rules) {
    // The engine's own rule is counted — its checks enforce it — and NAMED: an empty
    // `rules.mjs` printed "declared: 1, enforced: 1", a rule nobody could find.
    const engine = r.rules.engine.length ? ` (the engine's own: ${r.rules.engine.join(', ')})` : '';
    io.out('\nrule coverage:\n');
    io.out(`  declared: ${r.rules.declared}${engine}\n`);
    io.out(`  enforced: ${r.rules.enforced}\n`);
    io.out(`  not mechanizable (with reason): ${r.rules.notMechanizable}\n`);
    io.out(`  unenforced without a reason: ${r.rules.unenforcedWithoutReason}\n`);
    io.out(`  checks enforcing no rule (orphans): ${r.rules.orphans.length}\n`);
  }
  return 0;
}
