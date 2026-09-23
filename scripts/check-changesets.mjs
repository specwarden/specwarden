/**
 * The pending changesets, and the config `changeset version` will read them with.
 *
 * WHY THIS IS A GATE. A changeset is written on the day of the edit and read on the day
 * of the release, and everything that happens in between is invisible to it. A package
 * renamed, a slug moved under a scope, a bump typed as `minr` — each is found by
 * `changeset version` at the one moment nobody can afford a surprise, and the usual
 * repair under pressure is to delete the changeset, which deletes the only record of
 * what the change meant to a consumer.
 *
 * And the config is part of the same promise: `privatePackages.version` switched back on
 * would let a changeset bump a playground, and `access` set to anything but `public`
 * publishes scoped packages nobody can install.
 *
 * Run: node scripts/check-changesets.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGES, pkgName } from './registry.mjs';

export const CHANGESET_DIR = '.changeset';
export const BUMPS = Object.freeze(['patch', 'minor', 'major']);

const PUBLISHED = new Set(PACKAGES.map(pkgName));

/**
 * The frontmatter of one changeset, as `[package, bump]` pairs — or `undefined` when there
 * is no frontmatter at all. Quoted and unquoted names both parse, because both are what
 * `pnpm changeset` has written at one version or another.
 */
export function releasesOf(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return undefined;
  const releases = match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const pair = /^["']?([^"'\s:]+)["']?\s*:\s*["']?(\w+)["']?$/.exec(line);
      return pair ? [pair[1], pair[2]] : [line, undefined];
    });
  return { releases, body: match[2].trim() };
}

/** The problems with the config, as human strings. */
export function configProblems(config) {
  if (config === undefined)
    return [`${CHANGESET_DIR}/config.json is missing — \`pnpm changeset\` has nothing to read.`];
  const problems = [];
  if (config.baseBranch !== 'main')
    problems.push(`${CHANGESET_DIR}/config.json: baseBranch is \`${config.baseBranch}\`, not \`main\`.`);
  if (config.access !== 'public')
    problems.push(
      `${CHANGESET_DIR}/config.json: access is \`${config.access}\` — a scoped package published as restricted is one nobody can install.`,
    );
  if (config.privatePackages?.version !== false)
    problems.push(
      `${CHANGESET_DIR}/config.json: privatePackages.version must be false — a playground is a proof, and a changeset must never be able to version one.`,
    );
  return problems;
}

/** The problems with one changeset file, as human strings. */
export function changesetProblems(file, text) {
  const where = `${CHANGESET_DIR}/${file}`;
  const parsed = releasesOf(text);
  if (parsed === undefined) return [`${where} has no frontmatter — it names no package and bumps nothing.`];

  const problems = [];
  if (parsed.releases.length === 0) problems.push(`${where} names no package — an empty changeset releases nothing.`);
  for (const [name, bump] of parsed.releases) {
    if (!PUBLISHED.has(name))
      problems.push(
        `${where} names \`${name}\`, which the registry does not publish — renamed, or never existed. \`changeset version\` would fail on it at release time.`,
      );
    if (!BUMPS.includes(bump))
      problems.push(`${where}: \`${name}\` has bump \`${bump ?? '(none)'}\` — one of ${BUMPS.join(', ')}.`);
  }
  if (parsed.body.length === 0)
    problems.push(
      `${where} has no description. It is the only line a consumer reads before upgrading; the commit message is for somebody else.`,
    );
  return problems;
}

/** Every pending changeset in a directory listing — README.md is the folder's own. */
export const pendingChangesets = (names) => names.filter((n) => n.endsWith('.md') && n !== 'README.md').sort();

function main() {
  const root = process.cwd();
  const dir = join(root, CHANGESET_DIR);
  const configPath = join(dir, 'config.json');
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : undefined;
  const pending = existsSync(dir) ? pendingChangesets(readdirSync(dir)) : [];

  const problems = [
    ...configProblems(config),
    ...pending.flatMap((file) => changesetProblems(file, readFileSync(join(dir, file), 'utf8'))),
  ];

  if (problems.length > 0) {
    process.stderr.write(`${problems.length} changeset problem(s):\n\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write(`✓ changeset config sound, ${pending.length} pending changeset(s) name real packages\n`);
}

if (process.argv[1]?.endsWith('check-changesets.mjs')) main();
