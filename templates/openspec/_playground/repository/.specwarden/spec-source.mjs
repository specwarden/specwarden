// The spec source — OpenSpec: requirements from the `### Requirement:` headings under
// openspec/specs, tasks from each change's tasks.md. Every path is an option, because a
// memorised layout finds nothing the day the tool moves it. Nothing here is ever written.
import { openspec } from '@specwarden/openspec';

export const source = openspec({
  // root: 'openspec',
  // requirementHeading: /^#{2,4}\s+Requirement:\s*(.+?)\s*$/,
});
