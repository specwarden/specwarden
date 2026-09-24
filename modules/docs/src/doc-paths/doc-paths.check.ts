import type { ICheck, ICorpusFloor, IFinding, IModuleCheckDeclaration, TPathspecs } from 'specwarden';
import { buildCheck, checkOptions, lineOf, thresholdOf, verdictFrom, withExaminedNote } from 'specwarden';
import { DEFAULT_DOCS, DOCS_CORPUS_OPTIONS, corpusOf, refusedCorpus } from '../_shared/corpus/corpus.util';

export interface IDocPathsOptions extends IModuleCheckDeclaration {
  /** git pathspec(s) selecting the documentation corpus. Tracked files only, as
   * `git ls-files` lists them — a filesystem glob would pull in node_modules and
   * generated trees. Default: `**\/*.md`, every tracked document. */
  readonly docs?: TPathspecs;
  /** Pathspecs of documents left unread — snapshots and archives that quote dead paths as
   * their subject, and generated trees verified elsewhere. */
  readonly except?: readonly string[];
  /** How many documents a run must read for its verdict to count. Default: one. */
  readonly corpus?: ICorpusFloor;
  /** Paths deliberately absent (a worked example, a plan that says "this was
   * deleted"). Named, so the set stays auditable. */
  readonly illustrative?: readonly string[];
  /** Workspace-root prefixes a document may legitimately omit, tried in addition to
   * the document's own directory and every ancestor of it. */
  readonly prefixes?: readonly string[];
  /** Sibling-checkout prefixes (`reports/`) a document may point into. Those live
   * OUTSIDE this repository, so the engine cannot see them; a reference into one is
   * assumed to resolve, because the sibling is usually not checked out beside it and
   * "cannot see" must not become "does not exist". A scoped-package specifier (`@scope/pkg/…`, three
   * or more segments) is treated the same way: it names a file in an installed
   * package, not in this tree. */
  readonly externalPrefixes?: readonly string[];
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
 * roots, the exempt trees, the illustrative set and the sibling checkouts are
 * facts about one repository and arrive as options.
 */
export function docPaths(options: IDocPathsOptions = {}): ICheck {
  checkOptions('docPaths', options, {
    ...DOCS_CORPUS_OPTIONS,
    illustrative: { kind: 'array' },
    prefixes: { kind: 'array' },
    externalPrefixes: { kind: 'array' },
  });
  const docs = options.docs ?? DEFAULT_DOCS;
  const illustrative = new Set(options.illustrative ?? []);
  const roots = options.prefixes ?? [];
  const externals = options.externalPrefixes ?? [];

  return buildCheck(
    {
      ...options,
      id: options.id ?? 'doc-paths',
      rule: options.rule ?? {
        statement: 'a path the documentation names exists',
        owner: '@specwarden/docs',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self) => {
      const corpus = corpusOf(ctx.vcs, docs, options.except);
      const short = refusedCorpus(self.id, docs, corpus, options.corpus);
      if (short) return short;

      const findings: IFinding[] = [];
      for (const file of corpus.files) {
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
            findings.push({
              severity: 'error',
              file,
              line: lineOf(content, m.index ?? 0),
              message: `${file} names \`${ref}\`, which does not resolve. Point it at where the file is now — often it gained its own folder and the path did not follow.`,
            });
          }
        }
      }
      return verdictFrom(withExaminedNote(findings, self.id, corpus.files.length, 'document'), thresholdOf(ctx, self));
    },
  );
}
