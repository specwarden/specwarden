import type { ICheck, ICheckContext, ICheckIdentity, IFinding, IVerdict } from 'specwarden';
import { buildCheck, frameTolerated } from 'specwarden';

export interface IDocHygieneOptions extends ICheckIdentity {
  /** git pathspec for the markdown corpus. */
  readonly docs: string;
  /** Sources RENDERED into another tracked document — counting both counts the
   * same prose twice (the router overlay is assembled into CLAUDE.md). */
  readonly renderedSources?: readonly string[];
  /** A table row longer than this is a paragraph wearing a table's clothes. */
  readonly fatCellLimit?: number;
  /** The fat-cell budget — a repo-wide ratchet, never a per-cell verdict. */
  readonly ratchet?: number;
}

const HEADING_RE = /^#{1,6}\s/;
const MOVED_RE = /\bMOVED\b|\bmoved (?:to|out)\b|— MOVED/i;
const REL_LINK_RE = /\[[^\]]*\]\((\.{1,2}\/[^)\s#]+)(#[^)\s]*)?\)/g;
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
 * ratcheted.
 *
 * A PRODUCT check: link resolution, the moved-stub sweep and the cell budget are
 * universal; the corpus, the rendered sources and the budget are options.
 */
export function docHygiene(options: IDocHygieneOptions): ICheck {
  const limit = options.fatCellLimit ?? 300;
  const ratchet = options.ratchet ?? 0;
  const rendered = new Set(options.renderedSources ?? []);

  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx: ICheckContext): IVerdict => {
    const files = ctx.vcs.trackedFiles(options.docs).filter((f) => !rendered.has(f));
    const text = new Map<string, string>();
    const headings = new Map<string, string[]>();
    for (const f of files) {
      const src = ctx.files.tryRead(f);
      if (src === undefined) continue;
      text.set(f, src);
      headings.set(f, src.split('\n').filter((l) => HEADING_RE.test(l)).map((l) => l.replace(/^#+\s*/, '').trim()));
    }

    const broken: IFinding[] = [];
    const moved: IFinding[] = [];
    let fatCells = 0;
    const fatByFile = new Map<string, number>();

    for (const [f, src] of text) {
      const lines = src.split('\n');
      let inFence = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
        if (inFence) continue;

        if (/^\s*\|/.test(line) && line.length > limit) {
          fatCells++;
          fatByFile.set(f, (fatByFile.get(f) ?? 0) + 1);
        }

        for (const m of line.matchAll(REL_LINK_RE)) {
          if (!ctx.files.exists(resolveRel(f, m[1]))) broken.push({ severity: 'error', file: f, line: i + 1, message: `${f}:${i + 1} links to \`${m[1]}\`, which does not exist.`, ruleId: options.id });
        }

        for (const m of line.matchAll(SECTION_PTR_RE)) {
          const named = m[1];
          const base = named.replace(/^.*\//, '');
          const hit = [...text.keys()].find((k) => k === named || k.endsWith('/' + base));
          if (hit && sectionsMovedIn(headings.get(hit) ?? []).has(m[2].toLowerCase())) {
            moved.push({ severity: 'error', file: f, line: i + 1, message: `${f}:${i + 1} points at ${named} §${m[2]}, a MOVED stub — point at the document that now owns the content.`, ruleId: options.id });
          }
        }
      }
    }

    const findings: IFinding[] = [...broken, ...moved];
    if (fatCells > ratchet) {
      const worst = [...fatByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${n} ${f}`).join(', ');
      findings.push({ severity: 'error', message: `${fatCells} table rows over ${limit} chars; the ratchet is ${ratchet}. Fix the longest tables (${worst}). Rule: skills/agent-docs/SKILL.md §3.`, ruleId: options.id });
    }
    // broken/moved links never pass; a passing verdict's only error is the fat-cell
    // count tolerated by the ratchet — frame it so the ✅ is not printed above it.
    return frameTolerated(broken.length === 0 && moved.length === 0 && fatCells <= ratchet, findings, `the fat-cell ratchet ${ratchet}`);
  });
}
