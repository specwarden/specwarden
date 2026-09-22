import type { ICheck, ICheckIdentity, IFinding } from 'specwarden';
import { buildCheck, lineOf, verdictFrom } from 'specwarden';

export interface IDocPathsOptions extends ICheckIdentity {
  /** git pathspec selecting the documentation corpus (e.g. `*.md`). Tracked files
   * only, exactly as the legacy guard's `git ls-files` — a filesystem glob would
   * pull in node_modules and generated trees. */
  readonly docs: string;
  /** Directory prefixes whose documents are skipped — snapshots and archives that
   * quote dead paths as their subject, and generated trees verified elsewhere. */
  readonly skipDirs?: readonly string[];
  /** Paths deliberately absent (a worked example, a plan that says "this was
   * deleted"). Named, so the set stays auditable. */
  readonly illustrative?: readonly string[];
  /** Workspace-root prefixes a document may legitimately omit, tried in addition to
   * the document's own directory and every ancestor of it. */
  readonly prefixes?: readonly string[];
  /** Sibling-checkout prefixes (`adat-reports/`) a document may point into. Those
   * live OUTSIDE this repository, so the engine cannot see them; a reference into
   * one is assumed to resolve — matching the legacy guard's behaviour when the
   * sibling is not checked out. A scoped-package specifier (`@scope/pkg/…`, three
   * or more segments) is treated the same way: it names a file in an installed
   * package, not in this tree. */
  readonly externalPrefixes?: readonly string[];
  readonly ratchet?: number;
}

/** A scoped-package specifier — `@scope/pkg/rest` — names a file inside an
 * installed dependency, not this repository. `@alias/x` (two segments) is an import
 * alias and is resolved by the bare-form fallback, not treated as external. */
const SCOPED_PACKAGE_RE = /^@[^/]+\/[^/]+\//;

/** Only shapes unambiguously a file path — `dir/file.ext` inside backticks. Prose
 * mentioning a directory is not a pointer. Universal; the extension set is the
 * product's. */
export const DOC_PATH_RE =
  /`(\.?[A-Za-z_@][\w./@-]*\/[\w./@-]+\.(?:tsx?|scss|mjs|cjs|sh|sql|json|astro|ps1|md|ya?ml|css|html|txt|conf|toml))`/g;

function ancestors(dir: string): string[] {
  const out: string[] = [];
  for (let d = dir; d && d !== '.'; d = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '') out.push(`${d}/`);
  return out;
}

/**
 * Documentation names a FILE that is not there. A pointer wrong a quarter of the
 * time is worse than none: the reader greps the dead path, finds nothing, and
 * invents the rest. It resolves against the document's OWN directory and every
 * ancestor first — the convention module docs use — then the configured workspace
 * roots, so a legitimately relative path is not called a defect.
 *
 * A PRODUCT check: the scan, the ancestor walk and the ratchet are universal; the
 * roots, the skipped trees, the illustrative set and the sibling checkouts are
 * facts about one repository and arrive as options.
 */
export function docPaths(options: IDocPathsOptions): ICheck {
  const illustrative = new Set(options.illustrative ?? []);
  const skipDirs = options.skipDirs ?? [];
  const roots = options.prefixes ?? [];
  const externals = options.externalPrefixes ?? [];

  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx) => {
    const findings: IFinding[] = [];
    for (const file of ctx.vcs.trackedFiles(options.docs)) {
      if (skipDirs.some((d) => file.startsWith(d))) continue;
      const content = ctx.files.read(file);
      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
      const ws = file.split('/')[0];
      const prefixes = ['', ...ancestors(dir), ...roots.map((r) => r.replace('{ws}', ws))];
      const seen = new Set<string>();
      for (const m of content.matchAll(DOC_PATH_RE)) {
        const ref = m[1];
        if (seen.has(ref)) continue;
        seen.add(ref);
        if (illustrative.has(ref)) continue;
        if (externals.some((e) => ref.startsWith(e)) || SCOPED_PACKAGE_RE.test(ref)) continue; // outside the repo — unknowable, assumed present
        const variants = [ref, ref.replace(/^@/, '')];
        const resolves = variants.some((v) => prefixes.some((p) => ctx.files.exists(p + v)));
        if (!resolves) {
          findings.push({ severity: 'error', file, line: lineOf(content, m.index ?? 0), message: `${file} names \`${ref}\`, which does not resolve. Often the file gained its own folder and the path did not follow.`, ruleId: options.id });
        }
      }
    }
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
