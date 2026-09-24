/**
 * Packages each package's consumer skill for the two ways an agent installs one.
 *
 * ## Three things here are called a skill, and they have three different readers
 *
 * - `skills/<rule>/SKILL.md` — this repository's own canon: how to write code HERE.
 *   Never shipped. A contributor and an agent working in this repository read it.
 * - `<pkg>/SKILL.md` — how to MAINTAIN that package: what may not change, and why.
 *   Never shipped. Whoever edits the package reads it.
 * - `<pkg>/skills/specwarden-<slug>/SKILL.md` — how an agent should USE the package in
 *   SOMEBODY ELSE'S repository. This is the only one that ships, and it is the one this
 *   file packages.
 *
 * Collapsing any two of them produces a document that is wrong for one of its readers:
 * a consumer does not care which invariant a maintainer may not break, and a maintainer
 * does not need the decision procedure for configuring the thing they wrote.
 *
 * ## What is generated and what is written by hand
 *
 * The skill itself is HAND-WRITTEN. It is a decision procedure — when to reach for this,
 * what shape to write, what to refuse — and none of that can be derived from a document
 * written for a person reading top to bottom.
 *
 * What is generated is everything AROUND it: `reference.md`, the package's guide copied
 * in so the skill directory is self-contained on npm as well as in git; the plugin
 * manifest that makes a package directory an installable Claude Code plugin; and the
 * marketplace listing all of them. Generated, so `check:skills` keeps them equal to
 * their source rather than equal to whatever somebody last remembered to update.
 *
 * Run: node scripts/scaffold.mjs (this runs as part of it)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ORIGIN, PACKAGES, pkgDir, pkgName } from './registry.mjs';

const ROOT = process.cwd();

const write = (rel, text) => {
  const full = join(ROOT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
};

/** Packages that ship a skill. A template does not: it is consumed by one command that
 * writes files the repository then owns, and the skill for reasoning about those files
 * is the engine's. */
export const SHIPPING = PACKAGES.filter((p) => p.skill);

/**
 * The name a consumer sees, in their skill list and in `/plugin install`.
 *
 * `specwarden-<short>` — the npm name without its kind prefix — with the engine as plain
 * `specwarden`. Three things must agree on it: the folder, the plugin manifest and the
 * marketplace entry. When they do not, `/plugin install` names one thing and the skill
 * that loads announces itself as another.
 */
export const skillName = (pkg) => pkg.skill.name;

/** Where the shipped skill lives — inside the package it belongs to, so one layout
 * serves npm and the plugin marketplace both, and there is no second copy to keep in
 * step. */
export const skillDir = (pkg) => `${pkgDir(pkg)}/skills/${skillName(pkg)}`;

export const MARKETPLACE_PATH = '.claude-plugin/marketplace.json';

/** The version a package carries right now. READ, never declared: a literal here would
 * ship a skill naming a version the consumer is not running. */
export const currentVersion = (pkg) => {
  const path = join(ROOT, pkgDir(pkg), 'package.json');
  if (!existsSync(path)) return '0.0.0';
  return JSON.parse(readFileSync(path, 'utf8')).version ?? '0.0.0';
};

/** The manifest that turns a package directory into an installable plugin. The directory
 * IS the plugin: its `skills/` folder is what Claude Code loads. */
const pluginManifest = (pkg) => ({
  name: skillName(pkg),
  description: `${pkgName(pkg)} — ${pkg.description}`,
  version: currentVersion(pkg),
  author: { name: ORIGIN.owner },
  homepage: `${ORIGIN.repository}/tree/main/${pkgDir(pkg)}`,
  repository: ORIGIN.repository,
  license: ORIGIN.license,
  keywords: ['specwarden', 'quality-gates', pkg.kind],
});

const marketplace = () => ({
  name: 'specwarden',
  owner: { name: ORIGIN.owner, url: `https://github.com/${ORIGIN.owner}` },
  metadata: {
    description: 'Agent skills for specwarden — one plugin per package.',
    // The catalogue ships with the engine, so it carries the engine's number.
    version: currentVersion(PACKAGES[0]),
  },
  plugins: SHIPPING.map((pkg) => ({
    name: skillName(pkg),
    source: `./${pkgDir(pkg)}`,
    description: `${pkgName(pkg)} — ${pkg.description}`,
  })),
});

/**
 * `a/b` + `../c` → `a/c`, without touching the file system.
 */
const posixResolve = (from, target) => {
  const parts = from.split('/');
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return parts.join('/');
};

/**
 * Rewrite a document's relative links to absolute ones.
 *
 * The copy sits two directories below its source, so every `./GUIDE.md` and
 * `../../README.md` in it already resolves to nothing — and inside an npm tarball those
 * files are not shipped at all, so no relative path could ever work. An absolute link is
 * the only form that resolves for all three readers of this file: on the repository
 * page, in a consumer's `node_modules`, and in an agent's context.
 *
 * In-page anchors are left alone. They are the one relative form that survives the move.
 */
export const absoluteLinks = (markdown, fromDir) =>
  markdown.replace(/\]\((\.{1,2}\/[^)\s]+)\)/g, (whole, target) => {
    const [path, anchor] = target.split('#');
    const resolved = posixResolve(fromDir, path);
    return `](${ORIGIN.repository}/blob/main/${resolved}${anchor ? `#${anchor}` : ''})`;
  });

/**
 * Everything the skill layer generates, as path → contents.
 *
 * Exported as a map rather than written directly so the drift check can compare without
 * writing: a check that repaired what it found would report success over a repository
 * nobody had looked at.
 */
export function generatedSkillFiles() {
  const out = new Map();

  for (const pkg of SHIPPING) {
    out.set(`${pkgDir(pkg)}/.claude-plugin/plugin.json`, `${JSON.stringify(pluginManifest(pkg), null, 2)}\n`);

    // The guide, copied beside the skill that points at it. A copy rather than a link
    // across directories: a skill installed from npm has only its own folder, and one
    // that references a file it did not ship reads as a broken pointer at exactly the
    // moment somebody needs the detail.
    const guidePath = join(ROOT, pkgDir(pkg), 'GUIDE.md');
    if (existsSync(guidePath)) {
      const guide = readFileSync(guidePath, 'utf8');
      out.set(
        `${skillDir(pkg)}/reference.md`,
        `<!-- GENERATED from ${pkgDir(pkg)}/GUIDE.md. Edit the guide. -->\n\n${absoluteLinks(guide, pkgDir(pkg))}`,
      );
    }

    // The glossary travels the same way, for the same reason: an agent in somebody else's
    // repository reads the words this repository is written in, not a paraphrase of them.
    const glossaryPath = join(ROOT, pkgDir(pkg), 'GLOSSARY.md');
    if (existsSync(glossaryPath)) {
      const glossary = readFileSync(glossaryPath, 'utf8');
      out.set(
        `${skillDir(pkg)}/glossary.md`,
        `<!-- GENERATED from ${pkgDir(pkg)}/GLOSSARY.md. Edit the glossary. -->\n\n${absoluteLinks(glossary, pkgDir(pkg))}`,
      );
    }
  }

  out.set(MARKETPLACE_PATH, `${JSON.stringify(marketplace(), null, 2)}\n`);
  return out;
}

/** Write them. Called by the scaffolder. */
export function generateSkillPackaging() {
  for (const [rel, text] of generatedSkillFiles()) write(rel, text);
  return generatedSkillFiles().size;
}
