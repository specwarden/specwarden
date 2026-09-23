/**
 * Pins `check-skills.mjs` and the packaging in `skills.mjs`: a shipped skill that is
 * missing, misnamed, unmanifested, unpacked or unlisted is refused — and a listing that
 * points at nothing is refused as well.
 *
 * Every refusal is driven through `skillProblems` over THIS repository's files with one
 * of them overridden in memory, so each case proves the rule it names against what
 * actually ships, and nothing on disk is touched. The nobody-reads-it property is why the
 * spec matters: an agent that installs a broken plugin cannot tell us, so the gate is
 * the only reader these files have.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { skillProblems } from './check-skills.mjs';
import { ORIGIN, PACKAGES, pkgDir, pkgName } from './registry.mjs';
import { MARKETPLACE_PATH, SHIPPING, absoluteLinks, generatedSkillFiles, skillDir, skillName } from './skills.mjs';

const SCRIPT = resolve('scripts/check-skills.mjs');
const BLOB = `${ORIGIN.repository}/blob/main`;

/**
 * The repository's own files, with `edits` laid over them: a string replaces a file,
 * `null` removes it. A directory exists if anything left inside it does.
 */
const repoWith = (edits = {}) => {
  const read = (rel) => {
    if (rel in edits) return edits[rel] ?? undefined;
    return existsSync(rel) ? readFileSync(rel, 'utf8') : undefined;
  };
  const exists = (rel) => {
    if (rel in edits) return edits[rel] !== null;
    const inside = Object.keys(edits).filter((k) => k.startsWith(`${rel}/`));
    if (inside.some((k) => edits[k] !== null)) return true;
    return existsSync(rel);
  };
  return { read, exists };
};

const ENGINE = SHIPPING.find((p) => p.kind === 'core');
const MODULE = SHIPPING.find((p) => p.kind === 'module');
const skillPath = (pkg) => `${skillDir(pkg)}/SKILL.md`;
const skillOf = (pkg) => readFileSync(skillPath(pkg), 'utf8');
const marketplace = () => JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8'));
const withMarketplace = (edit) => {
  const m = marketplace();
  edit(m);
  return `${JSON.stringify(m, null, 2)}\n`;
};

/** The problems for one set of edits, joined, for a `toContain`. */
const refusedFor = (edits) => skillProblems(repoWith(edits)).join('\n');

describe('rewriting a guide for a skill folder', () => {
  it('resolves ./ against the package directory', () => {
    expect(absoluteLinks('[the guide](./GUIDE.md)', 'modules/docs')).toBe(`[the guide](${BLOB}/modules/docs/GUIDE.md)`);
  });

  it('resolves ../ upwards, however far', () => {
    expect(absoluteLinks('[a sibling](../openspec/GUIDE.md)', 'modules/speckit')).toBe(
      `[a sibling](${BLOB}/modules/openspec/GUIDE.md)`,
    );
    expect(absoluteLinks('[the root](../../README.md)', 'modules/docs')).toBe(`[the root](${BLOB}/README.md)`);
  });

  it('keeps the anchor on a relative link it rewrites', () => {
    expect(absoluteLinks('[x](./GUIDE.md#ratchets)', 'core')).toBe(`[x](${BLOB}/core/GUIDE.md#ratchets)`);
  });

  it('leaves in-page anchors and absolute URLs exactly as they were', () => {
    // An anchor is the one relative form that survives the move; an absolute URL already
    // resolves for every reader. Rewriting either would break a link that worked.
    const text = '[up](#install) and [npm](https://www.npmjs.com/package/specwarden) and [raw](http://x.test/a)';

    expect(absoluteLinks(text, 'modules/docs')).toBe(text);
  });

  it('rewrites every link in a document, not the first', () => {
    const out = absoluteLinks('[a](./A.md) then [b](./B.md)', 'core');

    expect(out).toBe(`[a](${BLOB}/core/A.md) then [b](${BLOB}/core/B.md)`);
  });
});

describe('the marketplace', () => {
  it('lists exactly the packages that ship a skill, each at its own directory', () => {
    const listed = marketplace().plugins.map((p) => [p.name, p.source]);

    expect(listed).toEqual(SHIPPING.map((p) => [skillName(p), `./${pkgDir(p)}`]));
  });

  it('points every entry at a directory holding the skill it names — what an install actually loads', () => {
    for (const { name, source } of marketplace().plugins) {
      expect(existsSync(`${source}/skills/${name}/SKILL.md`), `${name} → ${source}`).toBe(true);
    }
  });

  it('is what the scaffolder generates', () => {
    expect(readFileSync(MARKETPLACE_PATH, 'utf8')).toBe(generatedSkillFiles().get(MARKETPLACE_PATH));
  });
});

describe('what the skills gate refuses', () => {
  it('finds nothing wrong with the repository as it stands', () => {
    expect(skillProblems(repoWith())).toEqual([]);
  });

  it('refuses a package that declares a skill and carries no SKILL.md', () => {
    expect(refusedFor({ [skillPath(MODULE)]: null })).toContain(
      `${pkgName(MODULE)}: no ${skillDir(MODULE)}/SKILL.md — a package that declares a skill must carry one.`,
    );
  });

  it('refuses a SKILL.md with no frontmatter', () => {
    expect(refusedFor({ [skillPath(MODULE)]: '# just a heading\n' })).toContain('has no frontmatter');
  });

  it('refuses a name that disagrees with the folder', () => {
    const renamed = skillOf(MODULE).replace(`name: ${skillName(MODULE)}`, 'name: something-else');

    expect(refusedFor({ [skillPath(MODULE)]: renamed })).toContain(
      `declares a name that is not \`${skillName(MODULE)}\``,
    );
  });

  it("refuses a name that merely CONTAINS the right one — another skill's name in the engine's folder", () => {
    // The defect this case was written against: the rule was a substring test, and every
    // module's name begins with the engine's, so `name: specwarden-docs` in the engine's
    // SKILL.md satisfied it and /plugin install announced the wrong skill with the gate green.
    const borrowed = skillOf(ENGINE).replace(/^name: .*$/m, `name: ${skillName(MODULE)}`);
    const extended = skillOf(MODULE).replace(/^name: .*$/m, `name: ${skillName(MODULE)}-old`);

    expect(refusedFor({ [skillPath(ENGINE)]: borrowed })).toContain(
      `declares a name that is not \`${skillName(ENGINE)}\``,
    );
    expect(refusedFor({ [skillPath(MODULE)]: extended })).toContain(
      `declares a name that is not \`${skillName(MODULE)}\``,
    );
  });

  it('refuses a SKILL.md with no description', () => {
    const bare = skillOf(MODULE).replace(/^description:.*\r?\n/m, '');

    expect(refusedFor({ [skillPath(MODULE)]: bare })).toContain('has no description');
  });

  it('refuses a description key with nothing after it', () => {
    // Present and empty is as good as absent to an agent deciding whether to load it.
    const empty = skillOf(MODULE).replace(/^description:.*$/m, 'description:');

    expect(refusedFor({ [skillPath(MODULE)]: empty })).toContain('has no description');
  });

  it('accepts a description written as a block on the following lines', () => {
    const block = skillOf(MODULE).replace(/^description:.*$/m, 'description: >\n  folded onto the next line');
    const indented = skillOf(MODULE).replace(/^description:.*$/m, 'description:\n  on the next line');

    expect(skillProblems(repoWith({ [skillPath(MODULE)]: block }))).toEqual([]);
    expect(skillProblems(repoWith({ [skillPath(MODULE)]: indented }))).toEqual([]);
  });

  it('accepts a SKILL.md checked out with CRLF line endings', () => {
    // A Windows checkout with autocrlf: a rule anchored on `\n` would refuse every skill.
    const crlf = skillOf(MODULE).replace(/\r?\n/g, '\r\n');

    expect(skillProblems(repoWith({ [skillPath(MODULE)]: crlf }))).toEqual([]);
  });

  it('refuses a package with no plugin manifest', () => {
    expect(refusedFor({ [`${pkgDir(MODULE)}/.claude-plugin/plugin.json`]: null })).toContain(
      `${pkgName(MODULE)}: no .claude-plugin/plugin.json`,
    );
  });

  it('refuses a skill left out of the files list — it would reach no npm consumer', () => {
    const manifestPath = `${pkgDir(MODULE)}/package.json`;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files = manifest.files.filter((f) => f !== 'skills');

    expect(refusedFor({ [manifestPath]: JSON.stringify(manifest) })).toContain('does not list `skills` in `files`');
  });

  it('refuses a missing marketplace', () => {
    expect(refusedFor({ [MARKETPLACE_PATH]: null })).toContain(`${MARKETPLACE_PATH} is missing`);
  });

  it('refuses a marketplace that leaves out a shipping skill', () => {
    const without = withMarketplace((m) => (m.plugins = m.plugins.filter((p) => p.name !== skillName(MODULE))));

    expect(refusedFor({ [MARKETPLACE_PATH]: without })).toContain(`does not list ${skillName(MODULE)}`);
  });

  it('refuses a marketplace entry pointing at a directory that does not exist', () => {
    const moved = withMarketplace(
      (m) => (m.plugins.find((p) => p.name === skillName(MODULE)).source = './modules/gone'),
    );

    expect(refusedFor({ [MARKETPLACE_PATH]: moved })).toContain(
      `${skillName(MODULE)} points at ./modules/gone, which does not exist`,
    );
  });

  it('refuses a listed plugin that no package declares', () => {
    // It points somewhere real, so only the declaration rule can catch it: an entry for a
    // package that ships no skill installs a plugin that loads nothing.
    const extra = withMarketplace((m) => m.plugins.push({ name: 'specwarden-stray', source: './templates/node-ts' }));

    expect(skillProblems(repoWith({ [MARKETPLACE_PATH]: extra }))).toEqual([
      `${MARKETPLACE_PATH}: specwarden-stray is listed but no package declares it.`,
    ]);
  });
});

it('passes on the repository as it stands, and says how many skills it looked at', () => {
  const output = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });

  expect(output).toContain(
    `✓ ${SHIPPING.length} shipped skill(s), listed and installable (of ${PACKAGES.length} packages)`,
  );
});
