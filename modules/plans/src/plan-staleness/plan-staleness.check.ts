import { CHECK_CONTRACT_VERSION, type ICheck, type IVerdict, type TTier, computeLifecycle } from 'specwarden';

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
 * and which header fields an archive entry must carry. All of that is a host's convention —
 * but only the first two have to be answered. The rest carry the DEFAULT_* convention
 * below, because a consumer with no convention yet cannot answer them, and a check waiting
 * on an answer nobody has is a check that never runs.
 */

export interface IArchiveHeaderField {
  readonly label: string;
  readonly pattern: RegExp;
}

export interface IPlanStalenessOptions {
  readonly id: string;
  readonly title: string;
  readonly tier?: TTier;
  readonly hint?: string;
  readonly plansDir: string;
  readonly archiveDir: string;
  /** Matches a branch declaration, capturing the branch name in the LAST group. */
  readonly branchDeclaration?: RegExp;
  /** Matches a status declaration, capturing the status in the LAST group. */
  readonly statusDeclaration?: RegExp;
  /** Status words meaning the work is under way. */
  readonly activeStatuses?: readonly string[];
  /** The fields an archived plan's header must carry. */
  readonly archiveHeader?: readonly IArchiveHeaderField[];
  /** Files exempt from the "nothing links to the archive" rule — the document that owns
   * the archive contract has to name it. */
  readonly mayCiteArchive?: readonly string[];
  /** How many plans may omit a status before this fails. Only ever lowered. */
  readonly undeclaredStatusRatchet?: number;
  readonly when?: (changed: readonly string[]) => boolean;
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
 * Every one is overridable, and a house with its own convention passes its own regexes.
 * What is NOT overridable is that the declarations exist: a plan that does not say
 * whether it is under way cannot be told from one that shipped in March.
 */
export const DEFAULT_BRANCH_DECLARATION = /^\*\*Branch:\*\*\s*`?([^\s`]+)`?/m;
export const DEFAULT_STATUS_DECLARATION = /^\*\*Status:\*\*\s*`?(draft|active|done)`?/im;
export const DEFAULT_ACTIVE_STATUSES: readonly string[] = ['active'];

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

export function planStaleness(options: IPlanStalenessOptions): ICheck {
  const ratchet = options.undeclaredStatusRatchet ?? 0;
  // Resolved once, here, so every use below reads one name rather than repeating a
  // fallback — and a house convention passed in wins over the default silently, which
  // is the only place a default should ever be invisible.
  const branchDeclaration = stateless(options.branchDeclaration ?? DEFAULT_BRANCH_DECLARATION);
  const statusDeclaration = stateless(options.statusDeclaration ?? DEFAULT_STATUS_DECLARATION);
  const activeStatuses = options.activeStatuses ?? DEFAULT_ACTIVE_STATUSES;
  const archiveHeader = (options.archiveHeader ?? DEFAULT_ARCHIVE_HEADER).map((field) => ({
    ...field,
    pattern: stateless(field.pattern),
  }));
  const mayCiteArchive = options.mayCiteArchive ?? [`${options.plansDir}/README.md`, `${options.archiveDir}/README.md`];

  return {
    id: options.id,
    title: options.title,
    tier: options.tier ?? 'fast',
    zone: 'product',
    capabilities: ['read'],
    contractVersion: CHECK_CONTRACT_VERSION,
    hint: options.hint,
    when: options.when ?? ((changed) => changed.some((f) => f.endsWith('.md'))),
    run: (ctx): IVerdict => {
      const failures: string[] = [];
      const notes: string[] = [];

      const names = ctx.vcs.branchNames();
      const branches = names ? new Set(names) : null;

      const listMd = (dir: string): string[] => {
        if (!ctx.files.exists(dir) || !ctx.files.isDirectory(dir)) return [];
        return ctx.files
          .list(dir)
          .filter((f) => f.endsWith('.md') && f !== 'README.md')
          .slice()
          .sort();
      };

      let undeclared = 0;

      for (const file of listMd(options.plansDir)) {
        const rel = `${options.plansDir}/${file}`;
        const source = ctx.files.read(rel);
        const status = lastGroup(statusDeclaration.exec(source))?.toLowerCase();
        const declaredBranch = lastGroup(branchDeclaration.exec(source));

        if (status === undefined) {
          undeclared += 1;
          notes.push(`${rel}: no status declaration — cannot tell a draft from work under way`);
          continue;
        }

        const isActive = activeStatuses.includes(status);
        if (!isActive) {
          if (declaredBranch !== undefined) {
            failures.push(
              `${rel}: is a draft yet declares branch \`${declaredBranch}\`. Work with a branch has ` +
                'started — say so — or the branch is a placeholder, and a plan must not name one: ' +
                'it arms a hard failure for the day it is cleaned up.',
            );
          }
          continue;
        }
        if (declaredBranch === undefined) {
          failures.push(`${rel}: is active and declares no branch. An active plan names where its work happens.`);
          continue;
        }
        if (branches === null) {
          notes.push(`${rel}: branch \`${declaredBranch}\` — SKIPPED, this checkout has no branch refs to read`);
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
          failures.push(
            `${rel}: declares branch \`${declaredBranch}\`, which no longer exists here or on the ` +
              `remote. The work merged — harvest the plan and move it to ${options.archiveDir}/.`,
          );
        }
      }

      if (undeclared > ratchet) {
        failures.push(`${undeclared} plan(s) declare no status; the ratchet is ${ratchet}.`);
      }

      for (const file of listMd(options.archiveDir)) {
        const rel = `${options.archiveDir}/${file}`;
        const source = ctx.files.read(rel);
        const missing = archiveHeader.filter((h) => !h.pattern.test(source)).map((h) => h.label);
        if (missing.length > 0) {
          failures.push(
            `${rel}: archive header is missing ${missing.join(', ')}. Without it the archive is a ` +
              'slower delete — the reader cannot tell how far to trust the document, so they trust it fully.',
          );
        }
      }

      const archiveLink = new RegExp(`${options.archiveDir.replace(/[/\\]/g, '[/\\\\]')}\\/([\\w.-]+)\\.md`, 'g');
      for (const file of ctx.vcs.trackedFiles('**/*.md')) {
        if (file.startsWith(`${options.archiveDir}/`)) continue;
        if (mayCiteArchive.includes(file)) continue;
        const source = ctx.files.tryRead(file);
        if (source === undefined) continue;
        for (const match of source.matchAll(archiveLink)) {
          if (match[1] === 'README') continue;
          failures.push(
            `${file} links to ${options.archiveDir}/${match[1]}.md — an archived plan describes the ` +
              'past in the present tense; cite the document that owns the fact instead.',
          );
        }
      }

      const findings = [
        ...failures.map((message) => ({ severity: 'error' as const, message, ruleId: options.id })),
        ...notes.map((message) => ({ severity: 'info' as const, message, ruleId: options.id })),
      ];

      if (failures.length === 0) {
        findings.push({
          severity: 'info',
          message: `✓ plan staleness — ${undeclared} plan(s) without a status (ratchet ${ratchet}), archive clean`,
          ruleId: options.id,
        });
      }

      return { ok: failures.length === 0, findings };
    },
  };
}
