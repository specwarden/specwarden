/**
 * Pins `llms.mjs`: the index a model is handed names every document at an address that
 * resolves from anywhere, and leaves none out.
 *
 * Its reader is never in the room. A relative link resolves against wherever the model
 * loaded the file from, which is nowhere; a missing entry is a document that does not
 * exist for them. Neither failure is visible from inside this repository, so this spec
 * is the only place either can be seen.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { generateLlmsIndex } from './llms.mjs';
import { ORIGIN, PACKAGES, pkgDir } from './registry.mjs';
import { SHIPPING, skillDir } from './skills.mjs';

const RAW = `${ORIGIN.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/refs/heads/main/`;
const INDEX = generateLlmsIndex();

/** Every `[path](url)` in the index. */
const links = [...INDEX.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(([, path, url]) => ({ path, url }));
const paths = new Set(links.map((l) => l.path));

describe('the llms.txt index', () => {
  it('has links to check — an index that lists nothing passes every rule below', () => {
    expect(links.length).toBeGreaterThan(PACKAGES.length);
  });

  it('addresses every link absolutely, at the raw file, on main', () => {
    const wrong = links.filter(({ path, url }) => url !== `${RAW}${path}`);

    expect(wrong).toEqual([]);
  });

  it('holds no relative link anywhere, labelled or not', () => {
    // A bare `](./x)` in the prose would escape the link rule above only by not being
    // shaped like an entry — and it would resolve for nobody.
    expect(INDEX).not.toMatch(/\]\((?!https:\/\/)/);
  });

  it('lists every package', () => {
    for (const pkg of PACKAGES) expect(paths.has(`${pkgDir(pkg)}/README.md`), pkgDir(pkg)).toBe(true);
  });

  it('lists every skill an agent can install', () => {
    for (const pkg of SHIPPING) expect(paths.has(`${skillDir(pkg)}/SKILL.md`), skillDir(pkg)).toBe(true);
  });

  it('lists every rule of the canon, read from the folder rather than remembered', () => {
    const canon = readdirSync('skills', { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(`skills/${e.name}/SKILL.md`))
      .map((e) => `skills/${e.name}/SKILL.md`);

    expect(canon.length).toBeGreaterThan(0);
    for (const path of canon) expect(paths.has(path), path).toBe(true);
  });

  it('links only to files that exist in this repository', () => {
    const dead = [...paths].filter((path) => !existsSync(path));

    expect(dead).toEqual([]);
  });

  it('is what is committed', () => {
    expect(readFileSync('llms.txt', 'utf8')).toBe(INDEX);
  });
});

describe('the canon section, over a tree that grew a rule', () => {
  let scratch = null;

  afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    scratch = null;
  });

  /** The index as `llms.mjs` builds it with `cwd` at `dir` — its root is read at import. */
  const indexIn = (dir) =>
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(pathToFileURL(join(process.cwd(), 'scripts/llms.mjs')).href)}); process.stdout.write(m.generateLlmsIndex());`,
      ],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe' },
    );

  it('picks up a new rule by its existing, with its description as the gist', () => {
    // The property the folder read exists for: a rule added without anybody editing an
    // index still reaches the agents outside this repository.
    scratch = mkdtempSync(join(tmpdir(), 'specwarden-llms-'));
    mkdirSync(join(scratch, 'skills', 'new-rule'), { recursive: true });
    writeFileSync(
      join(scratch, 'skills', 'new-rule', 'SKILL.md'),
      '---\nname: new-rule\ndescription: A rule nobody listed.\n---\n',
    );
    mkdirSync(join(scratch, 'skills', 'not-a-rule'));

    const index = indexIn(scratch);

    expect(index).toContain(`- [skills/new-rule/SKILL.md](${RAW}skills/new-rule/SKILL.md): A rule nobody listed.`);
    // A folder with no SKILL.md is not a rule, and listing it would be a dead link.
    expect(index).not.toContain('skills/not-a-rule');
  });
});
