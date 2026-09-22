import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { IFileSource, ITemplate, ITemplateContext } from '../../../../domain';

export interface ITemplateLoad {
  readonly template?: ITemplate;
  /** Why there is no template — already phrased for the reader. */
  readonly problem?: string;
}

const TEMPLATE_PREFIX = '@specwarden/template-';

/**
 * The package a template name lives in. One rule, so a name is enough to install by.
 *
 * The scope is the product's own, and this is the one place the engine is allowed to
 * know it: `--template node-ts` has to resolve to something. The alternative is a flag
 * naming the package in full, which puts the naming scheme into every consumer's command
 * line instead of into one line here.
 */
export const packageForTemplate = (name: string): string => `${TEMPLATE_PREFIX}${name}`;

/**
 * The template names this repository has actually installed, read from its manifest.
 *
 * Read rather than listed: the engine must not know a template exists, so the only
 * honest source for "what can I pass to --template here" is the dependency list in
 * front of it. A wrong name is the commonest first-minute mistake with a scaffold, and
 * answering it with the available names costs nothing.
 */
export function installedTemplates(files: IFileSource): readonly string[] {
  const manifest = files.tryRead('package.json') ?? '';
  let parsed: Record<string, Record<string, string> | undefined>;
  try {
    parsed = JSON.parse(manifest) as Record<string, Record<string, string> | undefined>;
  } catch {
    return [];
  }
  const declared = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
  return Object.keys(declared)
    .filter((d) => d.startsWith(TEMPLATE_PREFIX))
    .map((d) => d.slice(TEMPLATE_PREFIX.length))
    .sort();
}

/**
 * Load a template by name, from the package the convention names.
 *
 * WHY DYNAMIC. The engine must not depend on any template: a template knows a stack,
 * and the engine's whole premise is that it knows none. So `--template node-ts` resolves
 * `@specwarden/template-node-ts` at run time, and a name nobody installed is a message
 * naming the install command — not a missing feature, and not a crash.
 *
 * WHY IT CHECKS `requires`. A template's generated files import the modules it composes.
 * Writing them into a repository that has not installed those modules produces a tree
 * that fails on its first run with an import error — the run that decides whether the
 * tool is kept. So the check happens BEFORE anything is written, and it names every
 * missing package at once rather than one per attempt.
 */
export async function loadTemplate(
  name: string,
  files: IFileSource,
  context: ITemplateContext,
): Promise<ITemplateLoad> {
  const pkg = packageForTemplate(name);

  let mod: Record<string, unknown>;
  try {
    // Resolved from the REPOSITORY, not from this package. A template is the
    // consumer's dependency: resolving it from here would look in the engine's own
    // node_modules, where it correctly is not — and the engine must not depend on any
    // template, since a template knows a stack and the engine knows none.
    const require = createRequire(join(files.root(), 'package.json'));
    mod = (await import(pathToFileURL(require.resolve(pkg)).href)) as Record<string, unknown>;
  } catch {
    const here = installedTemplates(files).filter((t) => t !== name);
    return {
      problem:
        `no template '${name}' — the package ${pkg} is not installed here.\n` +
        (here.length > 0 ? `  Installed here: ${here.join(', ')}\n` : '') +
        `  Install it and run init again, or omit --template for a minimal tree.`,
    };
  }

  const template = Object.values(mod).find(isTemplate);
  if (!template) {
    return {
      problem: `${pkg} exports no template — it must export an object with name, describe, requires, files() and rules().`,
    };
  }

  const manifest = files.tryRead('package.json') ?? '';
  // Resolved against THIS repository: a template writes different files here than it
  // would elsewhere, so it requires different packages here than it would elsewhere.
  const required = typeof template.requires === 'function' ? template.requires(context) : template.requires;
  const missing = required.filter((r) => !manifest.includes(`"${r}"`));
  if (missing.length > 0) {
    return {
      problem:
        `the '${name}' template needs ${missing.join(', ')}, which this repository has not declared.\n` +
        `  Its generated checks import them, so the tree would fail on its first run. Install them first.`,
    };
  }

  return { template };
}

function isTemplate(v: unknown): v is ITemplate {
  const t = v as ITemplate | undefined;
  return (
    typeof t === 'object' &&
    t !== null &&
    typeof t.name === 'string' &&
    typeof t.describe === 'string' &&
    (Array.isArray(t.requires) || typeof t.requires === 'function') &&
    typeof t.files === 'function' &&
    typeof t.rules === 'function'
  );
}
