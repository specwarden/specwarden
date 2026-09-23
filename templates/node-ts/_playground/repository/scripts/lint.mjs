// The house lint: a library that prints is a library its consumers cannot silence.
import { readFileSync, readdirSync } from 'node:fs';

const offenders = readdirSync('src')
  .filter((f) => f.endsWith('.ts'))
  .filter((f) => /console\.log\(/.test(readFileSync(`src/${f}`, 'utf8')));

if (offenders.length > 0) {
  console.error(`console.log in ${offenders.map((f) => `src/${f}`).join(', ')}`);
  process.exit(1);
}
