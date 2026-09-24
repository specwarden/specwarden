/**
 * `llms.txt` — every document in this repository, at a stable raw address.
 *
 * WHY IT IS GENERATED. It is the one file whose reader is never in the room: a model
 * handed the repository, or a person who followed a link out of one. A dead entry is
 * invisible to us and total for them, and a hand-maintained index of forty documents is
 * an index that is wrong within a month.
 *
 * The addresses are RAW and absolute. A relative link in this file resolves against
 * wherever the model happened to load it from, which is nowhere.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { KINDS, ORIGIN, PACKAGES, pkgDir, pkgName } from './registry.mjs';
import { SHIPPING, skillDir, skillName } from './skills.mjs';

const ROOT = process.cwd();
const RAW = `${ORIGIN.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/refs/heads/main`;

const link = (path, gist) => `- [${path}](${RAW}/${path}): ${gist}`;
const has = (rel) => existsSync(join(ROOT, rel));

/** The canon, read from the folder rather than listed — a rule added without an entry
 * here would be a rule no agent outside this repository can find. */
function canonEntries() {
  return readdirSync(join(ROOT, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && has(`skills/${e.name}/SKILL.md`))
    .map((e) => {
      const text = readFileSync(join(ROOT, 'skills', e.name, 'SKILL.md'), 'utf8');
      const gist = /description:\s*(.+)/.exec(text)?.[1]?.trim() ?? 'a rule of this repository';
      return link(`skills/${e.name}/SKILL.md`, gist);
    });
}

export function generateLlmsIndex() {
  const core = PACKAGES[0];
  const lines = [
    '# specwarden',
    '',
    '> A quality-gate engine. A repository declares its rules; specwarden proves which',
    '> hold — and the failure it is built against is the one nobody sees: a check that',
    '> cannot fail reports success.',
    `> ${PACKAGES.length} packages, versioned independently; each document names the version it describes.`,
    '',
    'Install the engine with `npm install specwarden`. It has no runtime dependencies and',
    'no opinions: every opinion is a separate package you install one at a time, because a',
    'check that could be wrong about a repository that has never heard of it should not',
    'arrive unasked.',
    '',
    'Every document below is flat markdown at a stable path. The paths are predictable:',
    '`<package>/README.md` for what a package is, `<package>/GUIDE.md` for how to use it,',
    '`<package>/skills/<name>/SKILL.md` for the decision procedure an agent follows.',
    '',
    '## Start here',
    '',
    link('README.md', 'what it fixes, every package, and what each one is for'),
    link('ARCHITECTURE.md', 'how the packages divide the work, and what decides where a check goes'),
    link('CONTRIBUTING.md', 'running the repository, and how a release is cut'),
    link('AGENTS.md', 'the router: where every rule lives'),
    '',
    '## Using it',
    '',
    link(`${skillDir(core)}/SKILL.md`, 'writing, running and reasoning about a check'),
    ...(has(`${pkgDir(core)}/GUIDE.md`) ? [link(`${pkgDir(core)}/GUIDE.md`, 'the engine end to end')] : []),
    ...(has(`${pkgDir(core)}/GLOSSARY.md`)
      ? [link(`${pkgDir(core)}/GLOSSARY.md`, 'every term the product uses, defined once')]
      : []),
    '',
    '## Packages',
    '',
    ...PACKAGES.map((p) => link(`${pkgDir(p)}/README.md`, `${pkgName(p)} — ${KINDS[p.kind].label}: ${p.description}`)),
    '',
    '## Skills an agent can install',
    '',
    ...SHIPPING.map((p) => link(`${skillDir(p)}/SKILL.md`, `${skillName(p)} — ${p.skill.description}`)),
    '',
    '## How this repository is written',
    '',
    ...canonEntries(),
    '',
  ];
  return `${lines.join('\n')}`;
}
