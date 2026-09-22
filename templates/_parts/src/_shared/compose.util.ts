import type { IPart } from './part.model';

/** Everything a template hands back, assembled from the parts it chose. */
export interface IComposed {
  readonly files: IPart['files'];
  readonly rules: IPart['rules'];
  readonly configExtras?: IPart['configExtras'];
}

/**
 * Merge parts in order.
 *
 * Duplicate paths THROW rather than resolving. Two parts writing the same file means a
 * template chose one thing twice — and whichever way a merge resolved it, one of the
 * two configurations would be silently gone, which is the failure mode this whole
 * engine exists against. Better to fail in the template's own test suite.
 */
export function compose(...parts: readonly IPart[]): IComposed {
  const files = parts.flatMap((p) => p.files);
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) throw new Error(`two parts both write ${f.path} — one of the two configurations would be lost`);
    seen.add(f.path);
  }

  const extras = parts.map((p) => p.configExtras).filter((e): e is NonNullable<IPart['configExtras']> => e !== undefined);
  return {
    files,
    rules: parts.flatMap((p) => p.rules),
    configExtras: extras.length
      ? {
          imports: extras.map((e) => e.imports).filter(Boolean).join('\n'),
          fields: extras.map((e) => e.fields).join(''),
        }
      : undefined,
  };
}
