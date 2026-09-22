/**
 * The ownership map — who owns each artifact of work, DECLARED rather than
 * implied. Three roles are contested between SpecWarden and a spec-driven tool
 * (the task list, the lifecycle of finished work, the agent's context), and two
 * lists of tasks in one repository is precisely the partial-second-copy defect the
 * whole harness is written against. So ownership is stated, and a conflict is a
 * loud refusal, not silent coexistence.
 */
export type TOwnableRole = 'requirements' | 'tasks' | 'plans' | 'invariants' | 'agentContext';

export const OWNABLE_ROLES: readonly TOwnableRole[] = ['requirements', 'tasks', 'plans', 'invariants', 'agentContext'];

/** A role → owner assignment. An owner is a source/subsystem name (`specwarden`,
 * `openspec`, …). */
export type TOwnershipMap = Partial<Record<TOwnableRole, string>>;

export interface IOwnershipFinding {
  readonly role: TOwnableRole;
  readonly message: string;
}

/**
 * Validate an ownership map against the set of owners the config actually provides.
 * An owner naming a source that is not configured is a defect — `doctor` reports it
 * — because a role assigned to a tool that is not present is a role nobody owns,
 * which is how a second task list quietly appears.
 */
export function validateOwnership(map: TOwnershipMap, knownOwners: readonly string[]): readonly IOwnershipFinding[] {
  const known = new Set(['specwarden', 'native', ...knownOwners]);
  const findings: IOwnershipFinding[] = [];
  for (const role of OWNABLE_ROLES) {
    const owner = map[role];
    if (owner !== undefined && !known.has(owner)) {
      findings.push({
        role,
        message: `role '${role}' is owned by '${owner}', which is not a configured source (known: ${[...known].join(', ')}).`,
      });
    }
  }
  return findings;
}

/** Whether SpecWarden's own subsystem for a role is active — i.e. the role is
 * unassigned or assigned to SpecWarden itself. When a role is owned by a foreign
 * tool, the matching subsystem (planning, router generation) stands down. */
export function ownsRole(map: TOwnershipMap, role: TOwnableRole): boolean {
  const owner = map[role];
  return owner === undefined || owner === 'specwarden' || owner === 'native';
}
