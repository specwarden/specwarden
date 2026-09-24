import type { ICheck, ICorpusFloor, IFinding, IModuleCheckDeclaration, TPathspecs } from 'specwarden';
import { buildCheck, checkOptions, thresholdOf } from 'specwarden';
import { DEFAULT_DOCS, DOCS_CORPUS_OPTIONS, corpusOf, debtVerdict, refusedCorpus } from '../_shared/corpus/corpus.util';

export interface IDocHygieneOptions extends IModuleCheckDeclaration {
  /** git pathspec(s) for the markdown corpus. Default: `**\/*.md`. */
  readonly docs?: TPathspecs;
  /** Pathspecs of documents left out — a source RENDERED into another tracked document
   * (a router overlay assembled into CLAUDE.md), whose prose would otherwise be read twice. */
  readonly except?: readonly string[];
  /** How many documents a run must read for its verdict to count. Default: one. */
  readonly corpus?: ICorpusFloor;
  /** A table row longer than this is a paragraph wearing a table's clothes. Default: 300. */
  readonly fatCellLimit?: number;
}

const HEADING_RE = /^#{1,6}\s/;
const MOVED_RE = /\bMOVED\b|\bmoved (?:to|out)\b|— MOVED/i;
const REL_LINK_RE = /\[[^\]]*\]\((\.{1,2}\/[^)\s#]+)(#[^)\s]*)?\)/g;
/** An inline code span: a run of backticks, anything, the same run. */
const CODE_SPAN_RE = /(`+)(?:(?!\1)[^])*?\1/g;
const SECTION_PTR_RE = /`([^`]*?\.md)`\s*§\s*([\dA-Za-z]+)/g;

/** Resolve a `./` or `../` link from a document to a repository-relative path. */
function resolveRel(fromFile: string, rel: string): string {
  const parts = (fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '').split('/').filter(Boolean);
  for (const seg of rel.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** The section ids a target document marks as MOVED — `5c / 5d. … MOVED` → 5c,5d. */
function sectionsMovedIn(headings: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const h of headings.filter((x) => MOVED_RE.test(x))) {
    const lead = h.match(/^([\dA-Za-z]+(?:\s*\/\s*[\dA-Za-z]+)*)\./);
    if (lead) for (const s of lead[1].split('/')) out.add(s.trim().toLowerCase());
  }
  return out;
}

/**
 * Documentation is loadable: relative links resolve, a `DOC.md §N` pointer does
 * not aim at a section that is now a "MOVED" stub, and the paragraph-sized table
 * cells stay under a repo-wide budget — the volume at which an agent stopped
 * scanning and invented an answer. The first two are hard failures; the third is
 * ratcheted: each over-long row is one finding, and `ratchet` is how many are tolerated.
 *
 * A PRODUCT check: link resolution, the moved-stub sweep and the cell budget are
 * universal; the corpus, its exemptions and the budget are options.
 */
export function docHygiene(options: IDocHygieneOptions = {}): ICheck {
  checkOptions('docHygiene', options, {
    ...DOCS_CORPUS_OPTIONS,
    fatCellLimit: { kind: 'number' },
  });
  const docs = options.docs ?? DEFAULT_DOCS;
  const limit = options.fatCellLimit ?? 300;

  return buildCheck(
    {
      ...options,
      id: options.id ?? 'doc-hygiene',
      rule: options.rule ?? {
        statement: 'documentation links resolve, point at no moved section, and keep table cells readable',
        owner: '@specwarden/docs',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self) => {
      const corpus = corpusOf(ctx.vcs, docs, options.except);
      // Too few documents is a failure, not a clean run: otherwise a `docs` pathspec that
      // stopped matching reports every link resolving over a corpus of nothing.
      const short = refusedCorpus(self.id, docs, corpus, options.corpus);
      if (short) return short;
      const text = new Map<string, string>();
      const headings = new Map<string, string[]>();
      for (const f of corpus.files) {
        const src = ctx.files.tryRead(f);
        if (src === undefined) continue;
        text.set(f, src);
        headings.set(
          f,
          src
            .split('\n')
            .filter((l) => HEADING_RE.test(l))
            .map((l) => l.replace(/^#+\s*/, '').trim()),
        );
      }

      const broken: IFinding[] = [];
      const moved: IFinding[] = [];
      const fat: IFinding[] = [];

      for (const [f, src] of text) {
        const lines = src.split('\n');
        let inFence = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^\s*```/.test(line)) {
            inFence = !inFence;
            continue;
          }
          if (inFence) continue;

          if (/^\s*\|/.test(line) && line.length > limit) {
            fat.push({
              severity: 'error',
              file: f,
              line: i + 1,
              message: `${f}:${i + 1} is a table row of ${line.length} characters, over the ${limit} a row stays readable at. Move the prose out of the table.`,
            });
          }

          // A link inside a code span is an EXAMPLE of a link — `[done](./_plans-archive/done.md)`
          // in prose about links — and was read as one, so a document explaining the syntax
          // failed on the path it quoted. Fenced blocks were already skipped; spans now are.
          const prose = line.replace(CODE_SPAN_RE, '');
          for (const m of prose.matchAll(REL_LINK_RE)) {
            if (!ctx.files.exists(resolveRel(f, m[1])))
              broken.push({
                severity: 'error',
                file: f,
                line: i + 1,
                message: `${f}:${i + 1} links to \`${m[1]}\`, which does not exist. Point the link at where the file is now.`,
              });
          }

          for (const m of line.matchAll(SECTION_PTR_RE)) {
            const named = m[1];
            const base = named.replace(/^.*\//, '');
            const hit = [...text.keys()].find((k) => k === named || k.endsWith('/' + base));
            if (hit && sectionsMovedIn(headings.get(hit) ?? []).has(m[2].toLowerCase())) {
              moved.push({
                severity: 'error',
                file: f,
                line: i + 1,
                message: `${f}:${i + 1} points at ${named} §${m[2]}, a MOVED stub. Point at the document that now owns the content.`,
              });
            }
          }
        }
      }

      // Broken and moved links never pass; the ratchet counts over-long rows only. They
      // were counted and never reported, so `--tighten` read no error line off a passing
      // run and stored a bar of 0 over the rows it had been tolerating.
      return debtVerdict({ hard: [...broken, ...moved], soft: fat }, thresholdOf(ctx, self), {
        id: self.id,
        examined: text.size,
        unit: 'document',
      });
    },
  );
}
