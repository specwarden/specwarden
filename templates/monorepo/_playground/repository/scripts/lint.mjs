// The workspace lint: no package reaches into another's src — it imports the package.
import { readFileSync, readdirSync } from 'node:fs';

const offenders = [];
for (const pkg of readdirSync('packages')) {
  for (const file of readdirSync(`packages/${pkg}/src`)) {
    if (/from '\.\.\/\.\.\//.test(readFileSync(`packages/${pkg}/src/${file}`, 'utf8'))) offenders.push(`packages/${pkg}/src/${file}`);
  }
}
if (offenders.length) {
  console.error(`reaches into another package by path: ${offenders.join(', ')}`);
  process.exit(1);
}
