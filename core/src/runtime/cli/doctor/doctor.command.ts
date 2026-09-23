import { computeCoverage, validateOwnership } from '../../../domain';
import type { CheckRegistry } from '../../container';
import { orphanChecks } from '../../rules';
import type { IWardenConfig } from '../../config/config.model';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/**
 * `doctor` — what this repository has DECLARED, printed without running any of it.
 *
 * It answers the question a red gate cannot: not "does the code pass" but "is the
 * harness itself wired". Every line is read from the config and the registry, so a
 * check that exists but enforces no rule, an ownership conflict, or a capability the
 * config denies out from under a check, all show up here rather than as a surprise
 * mid-run.
 */
export function doctor(config: IWardenConfig, registry: CheckRegistry, io: ICliIo): number {
  const denied = new Set(config.denyCapabilities ?? []);
  for (const c of registry.all()) {
    const caps = c.capabilities.length ? c.capabilities.join(',') : '—';
    const blocked = c.capabilities.some((cap) => denied.has(cap)) ? ' DENIED' : '';
    // The three things a reader asks doctor about one check, beyond its id: does it block,
    // does it need the machine to itself, and which file do I open to change it.
    const flags = `${c.advisory ? ' advisory' : ''}${c.exclusive ? ' exclusive' : ''}`;
    const origin = registry.originOf(c);
    io.out(`${c.id}\t${c.tier}\t${c.zone}\t[${caps}]${blocked}${flags}\t${c.title}${origin ? `\t${origin}` : ''}\n`);
  }
  if (denied.size) io.out(`\ndenyCapabilities: ${[...denied].join(', ')}\n`);

  if (config.ownership) {
    io.out('\nownership:\n');
    const knownOwners = config.specSource ? [config.specSource.name] : [];
    for (const [role, owner] of Object.entries(config.ownership)) io.out(`  ${role}: ${owner}\n`);
    const conflicts = validateOwnership(config.ownership, knownOwners);
    for (const c of conflicts) io.err(`  ⚠ ownership conflict: ${c.message}\n`);
    if (conflicts.length) return 1;
  }

  if (config.rules && config.rules.length > 0) {
    const cov = computeCoverage(config.rules);
    io.out('\nrule coverage:\n');
    io.out(`  declared: ${cov.total}\n`);
    io.out(`  enforced: ${cov.enforced}\n`);
    io.out(`  not mechanizable (with reason): ${cov.notMechanizable}\n`);
    io.out(`  unenforced without a reason: ${cov.unenforcedWithoutReason}\n`);
    const orphans = orphanChecks(
      registry.all().map((c) => c.id),
      config.rules,
    );
    io.out(`  checks enforcing no rule (orphans): ${orphans.length}\n`);
  }
  return 0;
}
