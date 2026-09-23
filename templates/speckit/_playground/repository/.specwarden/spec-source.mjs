// The spec source — Spec Kit: requirements from each feature's spec.md (`**FR-001**: …`),
// tasks from its tasks.md, each id prefixed by its feature so two FR-001s stay two. Every
// path is an option, because a memorised layout finds nothing the day the tool moves it.
import { speckit } from '@specwarden/speckit';

export const source = speckit({
  // root: 'specs',
  // specFile: 'spec.md',
  // tasksFile: 'tasks.md',
});
