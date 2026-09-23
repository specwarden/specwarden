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
import { join, posix } from 'node:path';

import { PACKAGES, pkgDir, pkgName } from './registry.mjs';
import { MARKETPLACE_PATH, SHIPPING, skillDir, skillName } from './skills.mjs';

/**
 * What is wrong with the shipped skills, as human strings. Empty means every one is
 * written, manifested, packed and listed.
 *
 * `read(rel)` answers a file's contents or `undefined`; `exists(rel)` answers for a file
 * or a directory. Handed in, so the spec can plant each refusal without editing this
 * repository.
 */
export function skillProblems({ read, exists, shipping = SHIPPING }) {
  const problems = [];

  for (const pkg of shipping) {
    const at = (m) => problems.push(`${pkgName(pkg)}: ${m}`);
    const dir = skillDir(pkg);

    // The skill itself is HAND-WRITTEN: it is a decision procedure, and nothing derives one.
    const skill = read(`${dir}/SKILL.md`);
    if (skill === undefined) {
      at(`no ${dir}/SKILL.md — a package that declares a skill must carry one.`);
      continue;
    }

    if (!/^---\r?\n/.test(skill))
      at(`${dir}/SKILL.md has no frontmatter — an agent reads name and description from it.`);
    else {
      const front = skill.slice(0, skill.indexOf('\n---', 4));
      // The WHOLE value, on its own line. A substring test let `name: specwarden-docs`
      // satisfy the engine's `specwarden`, and `name: specwarden-docs-old` satisfy the
      // docs module's — the exact disagreement this refusal exists for.
      const declared = /^name:\s*(.*?)\s*$/m.exec(front)?.[1];
      if (declared !== skillName(pkg)) {
        at(
          `${dir}/SKILL.md declares a name that is not \`${skillName(pkg)}\` — the folder, the manifest and the frontmatter must agree, or /plugin install names one thing and the skill announces another.`,
        );
      }
      // A value, not just the key: `description:` with nothing after it is a skill no
      // agent will ever choose to load, and the key alone used to satisfy this.
      if (!/^description:[ \t]*\S/m.test(front) && !/^description:[ \t]*\r?\n[ \t]+\S/m.test(front))
        at(`${dir}/SKILL.md has no description — it is what decides whether the skill is loaded at all.`);
    }

    // The manifest that makes the package directory installable.
    if (!exists(`${pkgDir(pkg)}/.claude-plugin/plugin.json`))
      at('no .claude-plugin/plugin.json — run `pnpm scaffold`.');

    // And it has to actually SHIP: a skill absent from `files` is a skill that exists on
    // the repository page and in no installed copy.
    const manifest = JSON.parse(read(`${pkgDir(pkg)}/package.json`));
    if (!(manifest.files ?? []).includes('skills')) {
      at('does not list `skills` in `files` — the skill would not reach an npm consumer at all.');
    }
  }

  const marketplace = read(MARKETPLACE_PATH);
  if (marketplace === undefined) {
    problems.push(`${MARKETPLACE_PATH} is missing — run \`pnpm scaffold\`.`);
  } else {
    const listed = JSON.parse(marketplace).plugins ?? [];
    const names = new Set(listed.map((p) => p.name));
    for (const pkg of shipping) {
      if (!names.has(skillName(pkg))) problems.push(`${MARKETPLACE_PATH} does not list ${skillName(pkg)}.`);
    }
    for (const entry of listed) {
      if (!exists(posix.normalize(entry.source)))
        problems.push(`${MARKETPLACE_PATH}: ${entry.name} points at ${entry.source}, which does not exist.`);
    }
    // A package that ships no skill must not be listed: an entry resolving to a directory
    // with no `skills/` folder installs a plugin that loads nothing.
    const declared = new Set(shipping.map((p) => skillName(p)));
    for (const entry of listed) {
      if (!declared.has(entry.name))
        problems.push(`${MARKETPLACE_PATH}: ${entry.name} is listed but no package declares it.`);
    }
  }

  return problems;
}

function main() {
  const ROOT = process.cwd();
  const exists = (rel) => existsSync(join(ROOT, rel));
  const read = (rel) => (exists(rel) ? readFileSync(join(ROOT, rel), 'utf8') : undefined);
  const problems = skillProblems({ read, exists });

  if (problems.length > 0) {
    process.stderr.write(`${problems.length} skill problem(s):\n\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `✓ ${SHIPPING.length} shipped skill(s), listed and installable (of ${PACKAGES.length} packages)\n`,
  );
}

if (process.argv[1]?.endsWith('check-skills.mjs')) main();
