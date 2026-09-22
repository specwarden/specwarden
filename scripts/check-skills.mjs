/**
 * The shipped skills, the plugin manifests and the marketplace that lists them.
 *
 * WHY THIS IS A GATE AND NOT A HABIT. Nobody in this repository reads the marketplace or
 * installs a skill from it, which is exactly why both rot: a dead entry is invisible to
 * us and total for the agent that followed it. The reader of these files is never the
 * person who edits them.
 *
 * Run: node scripts/check-skills.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGES, pkgDir, pkgName } from './registry.mjs';
import { MARKETPLACE_PATH, SHIPPING, skillDir, skillName } from './skills.mjs';

const ROOT = process.cwd();
const problems = [];

for (const pkg of SHIPPING) {
  const at = (m) => problems.push(`${pkgName(pkg)}: ${m}`);
  const dir = skillDir(pkg);

  // The skill itself is HAND-WRITTEN: it is a decision procedure, and nothing derives one.
  if (!existsSync(join(ROOT, dir, 'SKILL.md'))) {
    at(`no ${dir}/SKILL.md — a package that declares a skill must carry one.`);
    continue;
  }

  const skill = readFileSync(join(ROOT, dir, 'SKILL.md'), 'utf8');
  if (!/^---\r?\n/.test(skill)) at(`${dir}/SKILL.md has no frontmatter — an agent reads name and description from it.`);
  else {
    const front = skill.slice(0, skill.indexOf('\n---', 4));
    if (!front.includes(`name: ${skillName(pkg)}`)) {
      at(
        `${dir}/SKILL.md declares a name that is not \`${skillName(pkg)}\` — the folder, the manifest and the frontmatter must agree, or /plugin install names one thing and the skill announces another.`,
      );
    }
    if (!/description:/.test(front))
      at(`${dir}/SKILL.md has no description — it is what decides whether the skill is loaded at all.`);
  }

  // The manifest that makes the package directory installable.
  const manifestPath = join(ROOT, pkgDir(pkg), '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) at('no .claude-plugin/plugin.json — run `pnpm scaffold`.');

  // And it has to actually SHIP: a skill absent from `files` is a skill that exists on
  // the repository page and in no installed copy.
  const manifest = JSON.parse(readFileSync(join(ROOT, pkgDir(pkg), 'package.json'), 'utf8'));
  if (!(manifest.files ?? []).includes('skills')) {
    at('does not list `skills` in `files` — the skill would not reach an npm consumer at all.');
  }
}

const marketplacePath = join(ROOT, MARKETPLACE_PATH);
if (!existsSync(marketplacePath)) {
  problems.push(`${MARKETPLACE_PATH} is missing — run \`pnpm scaffold\`.`);
} else {
  const listed = JSON.parse(readFileSync(marketplacePath, 'utf8')).plugins ?? [];
  const names = new Set(listed.map((p) => p.name));
  for (const pkg of SHIPPING) {
    if (!names.has(skillName(pkg))) problems.push(`${MARKETPLACE_PATH} does not list ${skillName(pkg)}.`);
  }
  for (const entry of listed) {
    const source = join(ROOT, entry.source);
    if (!existsSync(source))
      problems.push(`${MARKETPLACE_PATH}: ${entry.name} points at ${entry.source}, which does not exist.`);
  }
  // A package that ships no skill must not be listed: an entry resolving to a directory
  // with no `skills/` folder installs a plugin that loads nothing.
  const shipping = new Set(SHIPPING.map((p) => skillName(p)));
  for (const entry of listed) {
    if (!shipping.has(entry.name))
      problems.push(`${MARKETPLACE_PATH}: ${entry.name} is listed but no package declares it.`);
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.length} skill problem(s):\n\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  `✓ ${SHIPPING.length} shipped skill(s), listed and installable (of ${PACKAGES.length} packages)\n`,
);
