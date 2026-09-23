import { shellLocalScope } from '@specwarden/ops';

export const check = shellLocalScope({
  id: 'shell-local-scope',
  title: 'local only inside a function',
  tier: 'fast',
  pathspecs: ['scripts/*.sh'],
  when: () => true,
});
