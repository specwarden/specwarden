import type { ICheck, ICorpusFloor, IFinding, IModuleCheckDeclaration, IVerdict, TPathspecs } from 'specwarden';
import { buildCheck, checkOptions, computeLifecycle, lineOf, thresholdOf } from 'specwarden';
import {
  DEFAULT_ARCHIVE_DIR,
  DEFAULT_PLANS_DIR,
  PLANS_SHARED_OPTIONS,
  corpusOf,
  debtVerdict,
  isExempt,
  refusedPlans,
} from '../_shared/corpus/corpus.util';
import { nothingInFlight, plansFolder } from '../_shared/plans-folder/plans-folder.util';

/**
 * A finished plan leaves the live corpus, and nothing cites the archive.
 *
 * WHAT A PLAN IS FOR, and what makes a stale one dangerous. A plan describes an intended
 * future in the PRESENT TENSE — which is exactly what a reader, and an agent, cannot
 * distinguish from a description of the present. One that outlives its work therefore does
 * not merely go out of date: it asserts a false present, in a folder whose whole purpose is
 * to be believed while the work is under way.
 *
 * THE THREE THINGS THAT ARE DECIDABLE, and each is a state a person cannot see:
 *   1. an ACTIVE plan whose branch no longer resolves — the work merged and nobody
 *      harvested it. This uses the engine's own lifecycle rule, where "cannot tell" (a
 *      checkout with no refs) stays active rather than being guessed as spent, because a
 *      guess here archives live work;
 *   2. a DRAFT that names a branch — it arms a hard failure for the day that branch is
 *      cleaned up, and reads as started work that nobody started;
 *   3. an inbound LINK to an archived plan — the citing document starts lying the moment
 *      the archived work lands, with nothing to notice.
 *
 * Plus the archive's own header: an entry that does not say what was harvested and what was
 * left open is a slower delete. The reader cannot tell how far to trust it, so they trust
 * it fully.
 *
 * WHAT IS CONFIGURATION: where plans live, where the archive is, which words a status uses,
 * and which header fields an archive entry must carry. All of that is a consumer's convention,
 * and every one of them carries a default — the folders the scaffolds write, and the
 * DEFAULT_* convention below — because a consumer with no convention yet cannot answer
 * them, and a check waiting on an answer nobody has is a check that never runs.
 */

export interface IArchiveHeaderField {
  readonly label: string;
  readonly pattern: RegExp;
}

export interface IPlanStalenessOptions extends IModuleCheckDeclaration {
  /** The flat plans folder. Default: `docs/_plans`. Absent, the check fails naming it. */
  readonly plansDir?: string;
  /** Where a harvested plan goes — outside `plansDir`. Default: `docs/_plans-archive`. An
   * archive that does not exist yet is a repository that has finished nothing, not a
   * failure. */
  readonly archiveDir?: string;
  /** git pathspec(s) of the documents read for a citation of the archive. Default: every
   * tracked markdown file, `**\/*.md`. */
  readonly docs?: TPathspecs;
  /** Pathspecs left out: a plan that is not judged, a document that may cite the archive.
   * Both folders' `README.md` own the archive contract and may always name it. */
  readonly except?: readonly string[];
  /** How many plans the folder must hold for a verdict to count. Default: none — a folder
   * with no plan is a repository with nothing in flight. */
  readonly corpus?: ICorpusFloor;
  /** Matches a branch declaration, capturing the branch name in the LAST group. */
  readonly branchDeclaration?: RegExp;
  /** Matches a status declaration, capturing the status in the LAST group. */
  readonly statusDeclaration?: RegExp;
  /** Status words meaning the work is under way. */
  readonly activeStatuses?: readonly string[];
  /** Status words meaning the work is finished — the plan is harvested, then moved or deleted. */
  readonly doneStatuses?: readonly string[];
  /** The fields an archived plan's header must carry. */
  readonly archiveHeader?: readonly IArchiveHeaderField[];
}

/**
 * THE DEFAULT CONVENTION, and why one exists at all.
 *
 * Five of this check's options describe how a plan DECLARES itself, and a consumer with
 * no convention yet cannot answer them — so before these defaults every scaffold either
 * shipped the check unconfigured (and it threw on the first repository that had a plan)
 * or shipped it as an example nobody filled in. Both end with the check not running.
 *
 * The defaults are a bolded-markdown header, because that is what a plan written by hand
 * already looks like:
 *
 *     **Status:** active
 *     **Branch:** feature/thing
 *
 * Every one is overridable, and a consumer with its own convention passes its own regexes.
 * What is NOT overridable is that the declarations exist: a plan that does not say
 * whether it is under way cannot be told from one that shipped in March.
 */
export const DEFAULT_BRANCH_DECLARATION = /^\*\*Branch:\*\*\s*`?([^\s`]+)`?/m;
export const DEFAULT_STATUS_DECLARATION = /^\*\*Status:\*\*\s*`?(draft|active|done)`?/im;
export const DEFAULT_ACTIVE_STATUSES: readonly string[] = ['active'];
export const DEFAULT_DONE_STATUSES: readonly string[] = ['done'];

/**
 * What an archive entry must carry. Each field answers a question a reader has to ask
 * before trusting an archived plan, and an entry missing them is a slower delete: the
 * reader cannot tell how far to trust it, so they trust it fully.
 */
export const DEFAULT_ARCHIVE_HEADER: readonly IArchiveHeaderField[] = [
  { label: 'Started', pattern: /^\*\*Started:\*\*\s*\S/m },
  { label: 'Finished', pattern: /^\*\*Finished:\*\*\s*\S/m },
  { label: 'Branch', pattern: /^\*\*Branch:\*\*\s*\S/m },
  { label: 'Harvested', pattern: /^\*\*Harvested:\*\*\s*\S/m },
  { label: 'Left open', pattern: /^\*\*Left open:\*\*\s*\S/m },
];

const lastGroup = (match: RegExpExecArray | null): string | undefined => (match ? match[match.length - 1] : undefined);

/**
 * A consumer's declaration regex without `g` or `y`. Either flag makes `exec` and `test`
 * resume from `lastIndex`, which survives from one plan to the next: with `/g`, every
 * second plan's status read as undeclared and every second archive entry as missing a
 * field it carried.
 */
const stateless = (re: RegExp): RegExp =>
  re.global || re.sticky ? new RegExp(re.source, re.flags.replace(/[gy]/g, '')) : re;

/** A relative markdown link — `[x](./y.md)`, `[x](../y.md)` — capturing the target. */
const RELATIVE_LINK = /\]\((\.{1,2}\/[^)\s#]+)/g;

/** A relative link written in `fromFile`, as a repository path. */
function resolveRelative(fromFile: string, rel: string): string {
  const parts = fromFile.split('/').slice(0, -1);
  for (const segment of rel.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return parts.join('/');
}

/** Changing a markdown file is what can make a plan stale, or cite the archive. */
const markdownChanged = (changed: readonly string[]): boolean => changed.some((f) => f.endsWith('.md'));

/**
 * THE RATCHET counts plans that declare no status — debt a repository with old plans may
 * carry while it adds the header. It was `undeclaredStatusRatchet`, read off the options
 * alone: the stored threshold never reached it, and a passing run reported the count only
 * as a note, so `--tighten` read zero error lines and stored a bar of 0 over the plans the
 * check had been tolerating. Every other defect here is one edit to repair, and never
 * tolerated.
 */
export function planStaleness(options: IPlanStalenessOptions = {}): ICheck {
  checkOptions('planStaleness', options, {
    ...PLANS_SHARED_OPTIONS,
    plansDir: { kind: 'string', nonEmpty: true },
    archiveDir: { kind: 'string', nonEmpty: true },
    docs: { kind: ['string', 'array'], nonEmpty: true },
    branchDeclaration: { kind: 'regexp' },
    statusDeclaration: { kind: 'regexp' },
    activeStatuses: { kind: 'array', nonEmpty: true },
    doneStatuses: { kind: 'array', nonEmpty: true },
    archiveHeader: { kind: 'array' },
  });
  const plansDir = options.plansDir ?? DEFAULT_PLANS_DIR;
  const archiveDir = options.archiveDir ?? DEFAULT_ARCHIVE_DIR;
  const docs = options.docs ?? '**/*.md';
  const except = options.except ?? [];
  // Resolved once, here, so every use below reads one name rather than repeating a
  // fallback — and a consumer's convention passed in wins over the default silently, which
  // is the only place a default should ever be invisible.
  const branchDeclaration = stateless(options.branchDeclaration ?? DEFAULT_BRANCH_DECLARATION);
  const statusDeclaration = stateless(options.statusDeclaration ?? DEFAULT_STATUS_DECLARATION);
  const activeStatuses = options.activeStatuses ?? DEFAULT_ACTIVE_STATUSES;
  const doneStatuses = options.doneStatuses ?? DEFAULT_DONE_STATUSES;
  const archiveHeader = (options.archiveHeader ?? DEFAULT_ARCHIVE_HEADER).map((field) => ({
    ...field,
    pattern: stateless(field.pattern),
  }));
  // The documents that own the archive contract have to name it.
  const contract = [`${plansDir}/README.md`, `${archiveDir}/README.md`];
  const archiveLink = new RegExp(`${archiveDir.replace(/[/\\]/g, '[/\\\\]')}\\/([\\w.-]+)\\.md`, 'g');

  return buildCheck(
    {
      ...options,
      id: options.id ?? 'plan-staleness',
      rule: options.rule ?? {
        statement: 'a plan is harvested before it goes stale, and nothing cites the archive',
        owner: '@specwarden/plans',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self): IVerdict => {
      const folder = plansFolder(ctx.files, plansDir, self.id);
      if ('refused' in folder) return { ok: false, findings: [folder.refused] };

      const hard: IFinding[] = [];
      const undeclared: IFinding[] = [];
      const notes: IFinding[] = [];

      const names = ctx.vcs.branchNames();
      const branches = names ? new Set(names) : null;

      const plansIn = (dir: string, listing: readonly string[]): string[] =>
        listing
          .filter((f) => f.endsWith('.md') && f !== 'README.md' && !isExempt(ctx.vcs, except, `${dir}/${f}`))
          .sort();
      const plans = plansIn(plansDir, folder.listed);
      const archived =
        ctx.files.exists(archiveDir) && ctx.files.isDirectory(archiveDir)
          ? plansIn(archiveDir, ctx.files.list(archiveDir))
          : [];

      const short = refusedPlans(self.id, plans.length, plansDir, options.corpus);
      if (short) return short;

      for (const file of plans) {
        const rel = `${plansDir}/${file}`;
        const source = ctx.files.read(rel);
        const statusMatch = statusDeclaration.exec(source);
        const branchMatch = branchDeclaration.exec(source);
        const status = lastGroup(statusMatch)?.toLowerCase();
        const declaredBranch = lastGroup(branchMatch);
        // Read only where the declaration it names was found.
        const at = (match: RegExpExecArray | null): number => lineOf(source, match!.index);

        if (status === undefined) {
          undeclared.push({
            severity: 'error',
            file: rel,
            message: `${rel} declares no status, so a draft cannot be told from work under way. Declare whether it is a draft, active or done.`,
          });
          continue;
        }

        // Finished work is its own state. It was read as a draft, so a plan marked done with
        // the branch its work happened on failed as "a draft that declares a branch".
        if (doneStatuses.includes(status)) {
          notes.push({
            severity: 'info',
            file: rel,
            line: at(statusMatch),
            message: `${rel} is done — harvest it, then move it to ${archiveDir}/ or delete it.`,
          });
          continue;
        }
        const isActive = activeStatuses.includes(status);
        if (!isActive) {
          if (declaredBranch !== undefined) {
            hard.push({
              severity: 'error',
              file: rel,
              line: at(branchMatch),
              message:
                `${rel} is a draft yet declares branch \`${declaredBranch}\`. Work with a branch has ` +
                'started — say so — or the branch is a placeholder, and a plan must not name one: ' +
                'it arms a hard failure for the day it is cleaned up.',
            });
          }
          continue;
        }
        if (declaredBranch === undefined) {
          hard.push({
            severity: 'error',
            file: rel,
            line: at(statusMatch),
            message: `${rel} is active and declares no branch. An active plan names where its work happens.`,
          });
          continue;
        }
        if (branches === null) {
          notes.push({
            severity: 'info',
            file: rel,
            line: at(branchMatch),
            message: `${rel}: branch \`${declaredBranch}\` — SKIPPED, this checkout has no branch refs to read.`,
          });
          continue;
        }

        // The engine's own lifecycle rule decides this, so "cannot tell" cannot become
        // "spent" by accident: an unknown branch state keeps a plan active.
        const lifecycle = computeLifecycle({
          status: 'active',
          branchExists: branches.has(declaredBranch),
          inArchive: false,
        });
        if (lifecycle === 'spent') {
          hard.push({
            severity: 'error',
            file: rel,
            line: at(branchMatch),
            message:
              `${rel} declares branch \`${declaredBranch}\`, which no longer exists here or on the ` +
              `remote. The work merged — harvest the plan and move it to ${archiveDir}/.`,
          });
        }
      }

      for (const file of archived) {
        const rel = `${archiveDir}/${file}`;
        const source = ctx.files.read(rel);
        const missing = archiveHeader.filter((h) => !h.pattern.test(source)).map((h) => h.label);
        if (missing.length > 0) {
          hard.push({
            severity: 'error',
            file: rel,
            message:
              `${rel}: archive header is missing ${missing.join(', ')}. Without it the archive is a ` +
              'slower delete — the reader cannot tell how far to trust the document, so they trust it fully.',
          });
        }
      }

      // Two spellings of one citation: the archive's repository path written out, and a
      // relative link that lands in it. Only the first was read, so `./_archive/done.md`,
      // written beside the archive, cited it in plain sight.
      const citing = corpusOf(ctx.vcs, docs, except);
      // Nothing read cannot cite the archive: with archived plans to cite, a `docs` that
      // matched nothing is this half of the check examining nothing.
      if (archived.length > 0 && citing.files.length === 0) {
        hard.push({
          severity: 'error',
          message: `\`docs\` matched no document, so nothing was read for a citation of ${archiveDir}/. Point \`docs\` at the repository’s documentation.`,
        });
      }
      for (const file of citing.files) {
        if (file.startsWith(`${archiveDir}/`) || contract.includes(file)) continue;
        const source = ctx.files.tryRead(file);
        if (source === undefined) continue;
        const cited = new Map<string, number>();
        const cite = (name: string, index: number | undefined): void => {
          if (name !== 'README' && !cited.has(name)) cited.set(name, lineOf(source, index as number));
        };
        for (const match of source.matchAll(archiveLink)) cite(match[1] as string, match.index);
        for (const match of source.matchAll(RELATIVE_LINK)) {
          const target = /^(.*)\/([\w.-]+)\.md$/.exec(resolveRelative(file, match[1] as string));
          if (target?.[1] === archiveDir) cite(target[2] as string, match.index);
        }
        for (const [name, line] of cited) {
          hard.push({
            severity: 'error',
            file,
            line,
            message:
              `${file}:${line} links to ${archiveDir}/${name}.md — an archived plan describes the ` +
              'past in the present tense; cite the document that owns the fact instead.',
          });
        }
      }

      if (plans.length === 0) notes.push(nothingInFlight(plansDir));
      return debtVerdict({ hard, soft: undeclared, notes }, thresholdOf(ctx, self), {
        id: self.id,
        examined: plans.length,
        unit: 'plan',
      });
    },
    options.when === undefined ? markdownChanged : undefined,
  );
}
