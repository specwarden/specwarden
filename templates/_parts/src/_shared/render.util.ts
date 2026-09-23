import type { ITemplateContext } from 'specwarden';

/**
 * A generated file's header: the check, and a few lines — what it catches, why in one
 * sentence, what to change. The reasoning lives in the module's GUIDE; the file carries
 * what its reader needs at the point of use.
 */
export function header(title: string, body: string): string {
  return [title, ...body.split('\n')].map((l) => `// ${l}`).join('\n');
}

/** The last line of every example's header: the two steps that switch it on. */
export const switchOn = (id: string): string =>
  `Switch it on: rename to ${id}.check.mjs AND uncomment its rule in rules.mjs.`;

/** The rule an example enforces once switched on — written into `rules.mjs` commented out. */
export const exampleRule = (id: string, statement: string) => ({
  id,
  statement,
  owner: '',
  enforcement: { checkIds: [id] },
});

/** `tier`, written only where it is not the engine's default. */
export const tierOption = (ctx: ITemplateContext): string => (ctx.tier === 'fast' ? '' : `  tier: '${ctx.tier}',\n`);

/** A single-quoted JavaScript literal. The backslash first, or its own escapes double. */
export const literal = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
