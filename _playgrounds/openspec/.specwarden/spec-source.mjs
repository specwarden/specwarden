/**
 * The spec source — OpenSpec.
 *
 * Requirements come from `openspec/specs/<capability>/spec.md` (the
 * `### Requirement:` headings), tasks from `openspec/changes/<change>/tasks.md`.
 * Both paths are OPTIONS rather than memorised facts: a tool that reorganises its
 * layout in a minor release is the normal case, and a memorised layout turns that into
 * a source that finds nothing while reporting success.
 *
 * SpecWarden never WRITES here. Reading the tool's directory is the whole relationship.
 */
import { openspec } from '@specwarden/openspec';

export const source = openspec({
  // root: 'openspec',
  // requirementHeading: /^#{2,4}\s+Requirement:\s*(.+?)\s*$/,
});
