/**
 * The spec source — Spec Kit.
 *
 * Requirements and tasks both come from `specs/<feature>/` — `spec.md` for the
 * `**FR-001**: the system MUST …` lines, `tasks.md` for the checkboxes. Ids keep
 * their upstream spelling, prefixed by the feature: two features may both number from
 * FR-001, and a collision would silently merge two different requirements into one.
 *
 * Every path is an OPTION. A tool that reorganises its layout in a minor release is the
 * normal case, and a memorised layout turns that into a source that finds nothing while
 * reporting success.
 */
import { speckit } from '@specwarden/speckit';

export const source = speckit({
  // root: 'specs',
  // specFile: 'spec.md',
  // tasksFile: 'tasks.md',
});
