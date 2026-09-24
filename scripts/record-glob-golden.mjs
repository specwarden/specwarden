#!/usr/bin/env node
/**
 * Records what Node's own `fs.globSync` answers for every pattern of the glob golden set
 * (`core/src/infrastructure/_contract/glob/glob.golden.json`), on this platform, and
 * writes it into that file. The engine's glob is then held to the recording on every
 * Node it supports — including the ones with no `globSync` at all.
 *
 * It refuses to run on any Node but the one the file names. The recording IS the
 * engine's promise, and Node's glob changed four times between 24.9 and 24.21 alone
 * (dot directories after `**`, sibling entries skipped on an early return, `ENOTDIR`, and
 * symlinks) — recorded on the wrong minor, the golden set would pin a bug as the answer.
 *
 * A section marked `sharedAcrossPlatforms` must record identically on every platform;
 * when this platform disagrees with one already recorded, nothing is written and the
 * patterns that differ are named. That is what keeps a case-sensitivity question out of
 * the set every platform shares.
 *
 * Run it on each platform the engine is recorded for — win32 and linux today:
 *
 *   node scripts/record-glob-golden.mjs
 */
import { globSync, statSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import {
  buildTree,
  buildable,
  fromRoot,
  GOLDEN_PATH,
  inRoot,
  readGolden,
} from '../core/src/infrastructure/_contract/glob/glob-fixture.mjs';

const golden = readGolden();
if (process.versions.node !== golden.node) {
  process.stderr.write(
    `record-glob-golden: the golden set is recorded on node ${golden.node}; this is ${process.versions.node}.\n`,
  );
  process.exit(1);
}

/** Exactly what `NodeFileSource.glob` does with an answer: files only, forward slashes, sorted. */
function answer(root, pattern) {
  try {
    const files = globSync(inRoot(pattern, root), { cwd: root }).filter((m) => {
      try {
        return statSync(resolve(root, m)).isFile();
      } catch {
        return false;
      }
    });
    return fromRoot(
      files.map((m) => m.split(sep).join('/')),
      root,
    ).sort();
  } catch (error) {
    return { throws: error.code ?? String(error.message) };
  }
}

const platform = process.platform;
const disagreements = [];
for (const [name, section] of Object.entries(golden.sections)) {
  if (!buildable(section, platform)) {
    process.stdout.write(`  ${name}: cannot be built on ${platform} — not recorded here\n`);
    continue;
  }
  const { root, cleanup } = buildTree(section.tree);
  try {
    const answers = Object.fromEntries(section.patterns.map((p) => [p, answer(root, p)]));
    if (section.sharedAcrossPlatforms) {
      for (const [other, recorded] of Object.entries(section.recorded)) {
        if (other === platform) continue;
        for (const p of section.patterns) {
          if (JSON.stringify(recorded[p]) !== JSON.stringify(answers[p]))
            disagreements.push(`${name} ${JSON.stringify(p)}: ${other} ≠ ${platform}`);
        }
      }
    }
    section.recorded[platform] = answers;
    process.stdout.write(`  ${name}: ${section.patterns.length} pattern(s) recorded on ${platform}\n`);
  } finally {
    cleanup();
  }
}

if (disagreements.length > 0) {
  process.stderr.write(
    `record-glob-golden: a shared section answers differently here — nothing written:\n  ${disagreements.join('\n  ')}\n`,
  );
  process.exit(1);
}
writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`);
