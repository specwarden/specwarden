/**
 * Every package that publishes an API has a playground, and the workspace has one for
 * all of them together.
 *
 * WHY THIS IS A GATE AND NOT A CONVENTION. "Each package has its own playground" is a
 * claim, and a claim nothing checks is true until the next package is added — at which
 * point it is false and nobody finds out, because the thing that is missing produces no
 * output at all. That is this product's own central failure, applied to the suites meant
 * to prevent it.
 *
 * WHAT A PLAYGROUND IS, and what separates it from the unit suite beside it: it imports
 * the package BY NAME, through the package's own `exports` map, the way a consumer does.
 * A unit suite imports by path, so it keeps passing over a package whose factory was
 * renamed and never re-exported from the barrel — and that is the first thing a consumer
 * meets. So the import style is checked too: a playground that reached in by relative
 * path would satisfy the file-exists half of this and prove nothing.
 *
 * TEMPLATES ARE NOT INCLUDED. They publish strings, not an API, and the committed trees
 * under `_playgrounds/` already scaffold and run every one of them.
 */
import { defineCheck } from 'specwarden';

import { PACKAGES, pkgDir, pkgName } from '../../../scripts/registry.mjs';

/** The kinds that publish an importable API, and therefore owe a playground. */
const PUBLISHES_AN_API = new Set(['core', 'module', 'plugin']);

const SPEC = '_playground/playground.spec.ts';

/** The workspace-wide one: every package in one config, over one repository. */
const ROOT_SPEC = `_playground/playground.spec.ts`;

export const checks = [
  defineCheck({
    id: 'package-playgrounds',
    title: 'every published package is exercised the way a consumer wires it',
    tier: 'fast',
    rule: {
      id: 'every-package-is-exercised-as-a-consumer-wires-it',
      statement:
        'a package that publishes an API carries a playground importing it by name, and the workspace carries one naming every such package',
      owner: 'skills/playgrounds/SKILL.md',
    },
    when: { under: ['core/', 'modules/', 'plugins/', 'scripts/registry.mjs', '_playground/'] },
    hint: 'Add `<pkg>/_playground/playground.spec.ts`, importing the package by NAME, and run each check over a clean tree and a broken one.',
    corpus: {
      atLeast: 2,
      why: 'the registry yielded fewer packages than this workspace has — the roster was read wrong, and a roster read wrong reports every missing playground as present.',
    },
    run: (ctx) => {
      const findings = [];
      const owing = PACKAGES.filter((p) => PUBLISHES_AN_API.has(p.kind));

      for (const pkg of owing) {
        const path = `${pkgDir(pkg)}/${SPEC}`;
        const source = ctx.files.tryRead(path);
        if (source === undefined) {
          findings.push({
            severity: 'error',
            file: path,
            message: `${pkgName(pkg)} publishes an API and has no playground. Add ${path}: every check it exports, wired the way a consumer wires it, run over a clean tree and a broken one.`,
          });
          continue;
        }
        // The distinction from the unit suite beside it. Reaching in by relative path
        // would satisfy "the file exists" and prove nothing a consumer feels.
        if (!source.includes(`'${pkgName(pkg)}'`)) {
          findings.push({
            severity: 'error',
            file: path,
            message: `${path} never imports \`${pkgName(pkg)}\` by name. A playground that reaches in by path is the unit suite again — it keeps passing over a factory that was renamed and never re-exported from the barrel, which is the first thing a consumer meets.`,
          });
        }
      }

      const root = ctx.files.tryRead(ROOT_SPEC);
      if (root === undefined) {
        findings.push({
          severity: 'error',
          file: ROOT_SPEC,
          message: `no workspace playground. ${ROOT_SPEC} is where the packages are proved to compose — one config naming all of them, over one repository. A per-package suite cannot see two packages minting the same check id, a plugin whose checks never reach the registry, or a module left in no tier.`,
        });
      } else {
        const unnamed = owing.filter((p) => !root.includes(`'${pkgName(p)}'`));
        if (unnamed.length > 0) {
          findings.push({
            severity: 'error',
            file: ROOT_SPEC,
            message: `the workspace playground names no ${unnamed.map(pkgName).join(', ')}. It exists to prove the packages compose, and a package left out of it composes with nothing.`,
          });
        }
      }

      return { findings, examined: owing.length + 1, unit: 'playground(s)' };
    },
  }),
];
