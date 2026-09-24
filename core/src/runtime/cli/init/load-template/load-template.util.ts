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
/**
 * Resolve one template's exported object, from the package alone.
 *
 * `found` says whether the PACKAGE resolved at all, separately from whether it exported
 * something template-shaped: `loadTemplate` tells "nobody installed this" from "this is
 * installed but broken" by it, and a LISTING (`init --template` alone) reads every
 * installed template's own line whether or not this repository has declared what it
 * needs yet — the point is to say what is here, not to gate it a second time.
 */
async function resolveTemplateModule(
  name: string,
  files: IFileSource,
): Promise<{ found: boolean; template?: ITemplate }> {
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
    return { found: false };
  }
  return { found: true, template: Object.values(mod).find(isTemplate) };
}

/**
 * Every template this repository has installed, with the one line it introduces itself
 * by — what `init --template` with no name prints, since a wrong or forgotten name is
 * answered better by what IS here than by silence.
 *
 * A name that fails to resolve, or resolves to something not template-shaped, is left
 * out rather than shown broken: the manifest's OWN declaration already said what should
 * be here, and a package that does not deliver it is a separate problem from this list.
 */
export async function listInstalledTemplates(
  files: IFileSource,
): Promise<readonly { readonly name: string; readonly describe: string }[]> {
  const resolved = await Promise.all(
    installedTemplates(files).map(async (name) => ({ name, ...(await resolveTemplateModule(name, files)) })),
  );
  return resolved
    .filter((r): r is { name: string; found: true; template: ITemplate } => r.template !== undefined)
    .map(({ name, template }) => ({ name, describe: template.describe }));
}

export async function loadTemplate(
  name: string,
  files: IFileSource,
  context: ITemplateContext,
): Promise<ITemplateLoad> {
  const pkg = packageForTemplate(name);
  const { found, template } = await resolveTemplateModule(name, files);
  if (!found) {
    const here = installedTemplates(files).filter((t) => t !== name);
    return {
      problem:
        `no template '${name}' — the package ${pkg} is not installed here.\n` +
        (here.length > 0 ? `  Installed here: ${here.join(', ')}\n` : '') +
        `  Install it and run init again, or omit --template for a minimal tree.`,
    };
  }
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
