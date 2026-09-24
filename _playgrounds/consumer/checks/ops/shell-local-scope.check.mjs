import { shellScope } from '@specwarden/ops';

export const check = shellScope({
  id: 'shell-local-scope',
  title: 'local only inside a function',
  tier: 'fast',
  scripts: ['scripts/*.sh'],
  when: () => true,
});
