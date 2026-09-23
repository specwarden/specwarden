/**
 * Every package has a playground inside it, and the root has exactly one for all of them.
 *
 * WHY THIS IS A GATE AND NOT A CONVENTION. "Each package has its own playground" is a
 * claim, and a claim nothing checks is true until the next package is added — at which
 * point it is false and nobody finds out, because the thing that is missing produces no
 * output at all. That is this product's own central failure, applied to the suites meant
 * to prevent it.
 *
 * WHAT A PACKAGE PLAYGROUND IS, and what separates it from the unit suite beside it: it
 * imports the package BY NAME, through the package's own `exports` map, the way a consumer
 * does. A unit suite imports by path, so it keeps passing over a factory that was renamed
 * and never re-exported from the barrel. So the import style is checked too.
 *
 * A TEMPLATE'S PLAYGROUND is a different shape, because a template publishes strings rather
 * than an API: a repository of the kind it is for, and a proof that `init` over it is green
 * and that every check it wrote goes red. `scripts/playground-proof.mjs` owns that proof;
 * this only refuses a template that has none.
 *
 * THE ROOT holds one playground and nothing else — the place the packages are proved to
 * compose. It must NAME every package in its spec and DECLARE every package in its
 * manifest: a package it resolves only through the root's hoisting is one it would lose
 * the day the hoisting changed.
 */
import { defineCheck } from 'specwarden';

import { PACKAGES, pkgDir, pkgName } from '../../../scripts/registry.mjs';

/** The kinds that publish an importable API, and therefore owe a playground that imports it. */
const PUBLISHES_AN_API = new Set(['core', 'module', 'plugin']);

const SPEC = '_playground/playground.spec.ts';
const ROOT_DIR = '_playgrounds';
const ROOT_SPEC = `${ROOT_DIR}/playground.spec.ts`;
const ROOT_MANIFEST = `${ROOT_DIR}/package.json`;

export const checks = [
  defineCheck({
    id: 'package-playgrounds',
    title: 'every package carries its playground, and the root carries one for all of them',
    tier: 'fast',
    rule: {
      id: 'every-package-is-exercised-as-a-consumer-wires-it',
      statement:
        'a package that publishes an API carries a playground importing it by name; a template carries a repository and the proof over it; the root carries one playground that names and declares every package',
      owner: 'skills/playgrounds/SKILL.md',
    },
    when: { under: ['core/', 'modules/', 'plugins/', 'templates/', 'scripts/registry.mjs', `${ROOT_DIR}/`] },
    hint: 'Add `<pkg>/_playground/playground.spec.ts` — by NAME for a package, through `provePlayground` over a `repository/` for a template — and run it over a clean tree and a broken one.',
    corpus: {
      atLeast: 2,
      why: 'the registry yielded fewer packages than this workspace has — the roster was read wrong, and a roster read wrong reports every missing playground as present.',
    },
    run: (ctx) => {
      const findings = [];
      const error = (file, message) => findings.push({ severity: 'error', file, message });
      const owing = PACKAGES.filter((p) => PUBLISHES_AN_API.has(p.kind));
      const templates = PACKAGES.filter((p) => p.kind === 'template');

      for (const pkg of owing) {
        const path = `${pkgDir(pkg)}/${SPEC}`;
        const source = ctx.files.tryRead(path);
        if (source === undefined) {
          error(
            path,
            `${pkgName(pkg)} publishes an API and has no playground. Add ${path}: every check it exports, wired the way a consumer wires it, run over a clean tree and a broken one.`,
          );
        } else if (!source.includes(`'${pkgName(pkg)}'`)) {
          error(
            path,
            `${path} never imports \`${pkgName(pkg)}\` by name. A playground that reaches in by path is the unit suite again — it keeps passing over a factory that was renamed and never re-exported from the barrel.`,
          );
        }
      }

      for (const pkg of templates) {
        const path = `${pkgDir(pkg)}/${SPEC}`;
        const source = ctx.files.tryRead(path);
        if (source === undefined || !source.includes(`provePlayground(`) || !source.includes(`'${pkg.slug}'`)) {
          error(
            path,
            `${pkgName(pkg)} has no proof over its own repository. ${path} must call \`provePlayground('${pkg.slug}', …)\`: green after init, and every check it writes shown red once.`,
          );
        }
        if (!ctx.files.isDirectory(`${pkgDir(pkg)}/_playground/repository`)) {
          error(
            `${pkgDir(pkg)}/_playground/repository`,
            `${pkgName(pkg)} has no repository to be scaffolded into. An empty directory produces a tree describing a repository nobody has — \`init\` detects what it writes for.`,
          );
        }
      }

      const root = ctx.files.tryRead(ROOT_SPEC);
      if (root === undefined) {
        error(
          ROOT_SPEC,
          `no workspace playground. ${ROOT_SPEC} is where the packages are proved to compose — one config naming all of them, over one repository. A per-package suite cannot see two packages minting the same check id, or a plugin whose checks never reach the registry.`,
        );
      } else {
        const unnamed = owing.filter((p) => !root.includes(`'${pkgName(p)}'`));
        if (unnamed.length) {
          error(
            ROOT_SPEC,
            `the workspace playground names no ${unnamed.map(pkgName).join(', ')}. A package left out of it composes with nothing.`,
          );
        }
      }

      const manifestText = ctx.files.tryRead(ROOT_MANIFEST);
      const declared = manifestText === undefined ? {} : (JSON.parse(manifestText).dependencies ?? {});
      const undeclared = owing.filter((p) => !(pkgName(p) in declared));
      if (undeclared.length) {
        error(
          ROOT_MANIFEST,
          `${ROOT_MANIFEST} does not declare ${undeclared.map(pkgName).join(', ')}. The root playground must depend on every package it composes — one it reaches only through hoisting is one it loses the day the hoisting changes.`,
        );
      }

      // The ONE root playground. A second folder beside it is how the per-package suites
      // started drifting to the root in the first place.
      for (const stray of ['_playground']) {
        if (ctx.files.exists(stray)) {
          error(
            stray,
            `${stray}/ at the root — the root holds exactly one playground, \`${ROOT_DIR}/\`. A package's playground lives inside that package.`,
          );
        }
      }

      return { findings, examined: owing.length + templates.length + 1, unit: 'playground(s)' };
    },
  }),
];
