/**
 * Pins `registry.mjs`: the invariants an edit to the package list could break with every
 * gate still green.
 *
 * The registry is the source everything else is derived from, so a mistake here is not
 * DRIFT — the scaffolder regenerates the mistake faithfully and the drift gate agrees
 * with it. Two packages under one npm name, a dependency on a name nothing publishes, a
 * coverage floor of 900: each produces a tree that is internally consistent and wrong.
 *
 * The rules are written once below as `registryProblems`, run over the real registry
 * (nothing) and over a copy broken one way per case (that way, named) — so each rule is
 * seen to fail, not only to pass.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { KINDS, PACKAGES, byName, pkgDeps, pkgDir, pkgName } from './registry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const THRESHOLDS = ['statements', 'branches', 'functions', 'lines'];

/** What the npm name must be, per kind, spelled out rather than read from `KINDS` — a
 * rule that asked `KINDS.naming` would agree with whatever `KINDS.naming` says. */
const EXPECTED_NAME = {
  core: () => 'specwarden',
  module: (slug) => `@specwarden/${slug}`,
  plugin: (slug) => `@specwarden/plugin-${slug}`,
  template: (slug) => `@specwarden/template-${slug}`,
  scaffold: () => '@specwarden/scaffold-parts',
};

const duplicates = (list) => list.filter((x, i) => list.indexOf(x) !== i);

/** The npm name, or the bare slug for a kind the scheme does not know — which is then
 * refused by name rather than thrown on. */
const nameOf = (pkg) => (pkg.kind in KINDS ? pkgName(pkg) : pkg.slug);
const dirOf = (pkg) => (pkg.kind in KINDS ? pkgDir(pkg) : (pkg.dir ?? pkg.slug));

function registryProblems(packages) {
  const problems = [];
  const names = packages.map(nameOf);
  const known = new Set(names);

  for (const name of duplicates(names)) problems.push(`[duplicate-name] ${name}`);
  for (const dir of duplicates(packages.map(dirOf))) problems.push(`[duplicate-dir] ${dir}`);

  for (const pkg of packages) {
    const name = nameOf(pkg);
    if (!(pkg.kind in EXPECTED_NAME)) {
      problems.push(`[unknown-kind] ${name}: ${pkg.kind}`);
      continue;
    }
    if (name !== EXPECTED_NAME[pkg.kind](pkg.slug)) problems.push(`[kind-naming] ${name}`);
    if (!existsSync(pkgDir(pkg))) problems.push(`[missing-dir] ${pkgDir(pkg)}`);

    for (const dep of [...(pkg.deps ?? []), ...(pkg.devDeps ?? [])]) {
      if (!known.has(dep)) problems.push(`[unknown-dep] ${name} → ${dep}`);
      if (dep === name) problems.push(`[self-dep] ${name}`);
    }

    const c = pkg.coverage;
    if (!c) problems.push(`[no-coverage] ${name}`);
    else {
      for (const key of THRESHOLDS) {
        if (!Number.isInteger(c[key]) || c[key] < 0 || c[key] > 100)
          problems.push(`[threshold] ${name}.${key}=${c[key]}`);
      }
      const measured = /^\d{4}-\d{2}-\d{2}$/.test(c.measured ?? '') ? new Date(`${c.measured}T00:00:00Z`) : undefined;
      // A floor measured in the future is a number somebody typed, not a measurement.
      if (!measured || Number.isNaN(measured.getTime()) || measured > new Date()) {
        problems.push(`[measured] ${name}: ${c.measured}`);
      }
    }

    if (pkg.skill) {
      if (!pkg.skill.name?.startsWith('specwarden')) problems.push(`[skill-name] ${name}: ${pkg.skill.name}`);
      if (!pkg.skill.description?.trim()) problems.push(`[skill-description] ${name}`);
    }
  }

  for (const skill of duplicates(packages.filter((p) => p.skill).map((p) => p.skill.name))) {
    problems.push(`[duplicate-skill] ${skill}`);
  }
  return problems;
}

/** A copy of the registry with `edit` applied to the package at `index`. */
const brokenAt = (index, edit) =>
  PACKAGES.map((p, i) => (i === index ? edit({ ...p, coverage: { ...p.coverage } }) : p));

const MODULE_AT = PACKAGES.findIndex((p) => p.kind === 'module');
const TEMPLATE_AT = PACKAGES.findIndex((p) => p.kind === 'template');

describe('the registry', () => {
  it('holds every rule as it stands', () => {
    expect(registryProblems(PACKAGES)).toEqual([]);
  });

  it('lists the engine first and only once — the marketplace and llms.txt read PACKAGES[0] as the engine', () => {
    expect(PACKAGES[0].kind).toBe('core');
    expect(PACKAGES.filter((p) => p.kind === 'core')).toHaveLength(1);
  });

  it('names a package in every kind the naming scheme has, so no rule below is vacuous', () => {
    expect(new Set(PACKAGES.map((p) => p.kind))).toEqual(new Set(Object.keys(KINDS)));
  });

  it('finds every package by its npm name — which only holds while names are unique', () => {
    for (const pkg of PACKAGES) expect(byName(pkgName(pkg))).toBe(pkg);
  });

  it('gives the engine no sibling to depend on, and every other package the engine first', () => {
    expect(pkgDeps(PACKAGES[0])).toEqual([]);
    for (const pkg of PACKAGES.slice(1)) expect(pkgDeps(pkg)[0]).toBe('specwarden');
  });

  it('keeps the kind in a plugin and a template name, and drops it from a module name', () => {
    expect(pkgName({ kind: 'module', slug: 'x' })).toBe('@specwarden/x');
    expect(pkgName({ kind: 'plugin', slug: 'x' })).toBe('@specwarden/plugin-x');
    expect(pkgName({ kind: 'template', slug: 'x' })).toBe('@specwarden/template-x');
  });
});

describe('what a registry edit is refused for', () => {
  it('two packages publishing under one npm name', () => {
    // A module and a template share slugs on purpose (`ops`, `nestjs`); the kind in the
    // name is what keeps them apart. Two modules on one slug is one tarball overwriting another.
    const twin = [...PACKAGES, { ...PACKAGES[MODULE_AT], dir: 'modules/twin' }];

    expect(registryProblems(twin)).toContain(`[duplicate-name] ${pkgName(PACKAGES[MODULE_AT])}`);
  });

  it('two packages in one directory', () => {
    const shared = brokenAt(TEMPLATE_AT, (p) => ({ ...p, dir: pkgDir(PACKAGES[MODULE_AT]) }));

    expect(registryProblems(shared)).toContain(`[duplicate-dir] ${pkgDir(PACKAGES[MODULE_AT])}`);
  });

  it('a directory that does not exist', () => {
    expect(registryProblems(brokenAt(MODULE_AT, (p) => ({ ...p, dir: 'modules/nowhere' })))).toContain(
      '[missing-dir] modules/nowhere',
    );
  });

  it('a dependency on a name the registry does not publish — the pre-scope name, say', () => {
    const stale = brokenAt(TEMPLATE_AT, (p) => ({ ...p, deps: [...p.deps, 'specwarden-module-docs'] }));

    expect(registryProblems(stale).join()).toContain('[unknown-dep]');
  });

  it('a dev dependency on a name the registry does not publish', () => {
    const stale = brokenAt(TEMPLATE_AT, (p) => ({ ...p, devDeps: ['@specwarden/gone'] }));

    expect(registryProblems(stale).join()).toContain('→ @specwarden/gone');
  });

  it('a kind whose name breaks the scheme', () => {
    expect(registryProblems(brokenAt(MODULE_AT, (p) => ({ ...p, kind: 'mystery' }))).join()).toContain(
      '[unknown-kind]',
    );
  });

  it('a package with no coverage ratchet', () => {
    expect(registryProblems(brokenAt(MODULE_AT, (p) => ({ ...p, coverage: undefined }))).join()).toContain(
      '[no-coverage]',
    );
  });

  it.each([
    ['a fraction', 87.5],
    ['a percentage over 100', 101],
    ['a negative floor', -1],
    ['a string', '90'],
  ])('a threshold that is %s', (_what, value) => {
    const broken = brokenAt(MODULE_AT, (p) => ({ ...p, coverage: { ...p.coverage, branches: value } }));

    expect(registryProblems(broken).join()).toContain('[threshold]');
  });

  it.each([
    ['missing', undefined],
    ['not a date', 'last week'],
    ['in the future', '2999-01-01'],
  ])('a measured date that is %s', (_what, value) => {
    const broken = brokenAt(MODULE_AT, (p) => ({ ...p, coverage: { ...p.coverage, measured: value } }));

    expect(registryProblems(broken).join()).toContain('[measured]');
  });

  it('a shipped skill whose name does not start with specwarden', () => {
    const broken = brokenAt(MODULE_AT, (p) => ({ ...p, skill: { ...p.skill, name: 'docs' } }));

    expect(registryProblems(broken).join()).toContain('[skill-name]');
  });

  it('two packages shipping one skill name — /plugin install could only ever reach one', () => {
    const broken = brokenAt(MODULE_AT, (p) => ({ ...p, skill: { ...p.skill, name: 'specwarden' } }));

    expect(registryProblems(broken)).toContain('[duplicate-skill] specwarden');
  });
});

describe('a template describes itself in one place', () => {
  // `describe` on the template object and `description` in this registry were two copies of
  // one sentence, kept equal by hand; the monorepo's said "credential scan" in one and "CI
  // coverage" in the other. `init --template` prints the first, the README the second.
  it.each(PACKAGES.filter((p) => p.kind === 'template'))('$slug says the same thing in both', async (pkg) => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(resolve(HERE, `../${pkgDir(pkg)}/src/index.ts`)).href);
    const template = Object.values(mod).find(
      (value) => typeof value === 'object' && value !== null && 'describe' in value,
    );
    expect(template, `${pkg.slug} exports a template`).toBeDefined();
    expect(template.describe).toBe(pkg.description);
  });
});
