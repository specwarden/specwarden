import { docSymbols } from '@specwarden/docs';

export const check = docSymbols({
  id: 'doc-symbols',
  title: 'documented symbols exist',
  tier: 'fast',
  docs: '**/*.md',
  code: ['src/**/*.ts'],
  suffixes: ['Registry', 'Service'],
});
