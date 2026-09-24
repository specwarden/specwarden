/**
 * The import grammar, with ONE owner.
 *
 * `forbidImport` (the generic ban) and `zoneBoundary` (the P→C barrier) both scan for
 * module specifiers, and a drift between two copies would let one of them stop seeing
 * what the other still catches — silently, since both would keep reporting green.
 */

/** Matches the specifier of an ES import / re-export, a dynamic `import('…')` or a
 * CommonJS require. Global, so `matchAll` walks every import; `matchAll` clones it, so
 * the shared `lastIndex` never leaks between files. The dynamic form loads a module as
 * surely as the static one, and without it a ban held for every spelling but that one. */
export const IMPORT_RE =
  /(?:import\s+[^'"]*from\s*|import\s*\(\s*|import\s*|require\s*\(\s*|export\s+[^'"]*from\s*)['"]([^'"]+)['"]/g;

/** `re.test(s)` without the statefulness a global regex carries. A consumer may pass a
 * `/g` regex, and `.test` on one advances `lastIndex`, so the NEXT call against a
 * different string silently mismatches — a false negative where a check should be red. Use this
 * wherever a consumer-supplied regex is `.test`ed across more than one input. */
export function testStateless(re: RegExp, s: string): boolean {
  return (re.flags.includes('g') ? new RegExp(re.source, re.flags.replace('g', '')) : re).test(s);
}

/** Whether an import `specifier` matches `target`: a RegExp (its global flag stripped
 * so `.test` is stateless), or a string that is the module exactly or its prefix `to/…`.
 * A target written WITH its trailing slash (`@db/`) is that prefix and only that: it
 * used to be compared as `@db//…`, which no specifier is, so the ban matched nothing. */
export function matchesSpecifier(specifier: string, target: string | RegExp): boolean {
  if (target instanceof RegExp) return testStateless(target, specifier);
  if (target.endsWith('/')) return specifier.startsWith(target);
  return specifier === target || specifier.startsWith(`${target}/`);
}
