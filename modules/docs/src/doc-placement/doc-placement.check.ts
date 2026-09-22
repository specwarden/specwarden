import type { ICheck, ICheckContext, ICheckIdentity, IFinding, IVerdict } from 'specwarden';
import { buildCheck, frameTolerated, testStateless } from 'specwarden';

export interface IDocPlacementOptions extends ICheckIdentity {
  /** git pathspec for the markdown corpus. */
  readonly docs: string;
  /** The placement contract: a document must match ONE of these. Regexes, because
   * the contract's shapes (alternations, anchored names) exceed what a glob says. */
  readonly allowed: readonly RegExp[];
  /** Optional inbound-link ban: nothing outside `dir` may link to a file under it
   * (a plan is deleted when its work ends, so every inbound pointer is a delayed
   * dangling one). `pattern` is global with capture group 1 = the linked name;
   * `allow` names the one file that is safe to point at (the folder's own README). */
  readonly link?: { readonly pattern: RegExp; readonly dir: string; readonly allow?: string };
  /** Ratchet on placement offenders only; an inbound link always fails. */
  readonly ratchet?: number;
}

/**
 * A markdown file sits where the placement contract describes, and nothing links
 * into the deletable-plan folder from outside it. A location the contract does not
 * describe is not wrong — it is UNDECIDED, which is where a partial second copy is
 * born; either the contract gains a row or the file moves.
 *
 * A PRODUCT check: matching a path against a contract, and banning an inbound link
 * into a folder, are universal; the contract's shapes and the folder are facts
 * about one repository and arrive as options.
 */
export function docPlacement(options: IDocPlacementOptions): ICheck {
  const ratchet = options.ratchet ?? 0;
  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx: ICheckContext): IVerdict => {
    const files = ctx.vcs.trackedFiles(options.docs);

    const placement: IFinding[] = files
      .filter((f) => !options.allowed.some((re) => testStateless(re, f)))
      .map((file) => ({ severity: 'error', file, message: `${file} sits where the placement contract does not describe — decide: move it, or add the row to the contract.`, ruleId: options.id }));

    const links: IFinding[] = [];
    if (options.link) {
      const { pattern, dir, allow } = options.link;
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      for (const file of files) {
        if (file.startsWith(dir)) continue;
        const body = ctx.files.tryRead(file);
        if (body === undefined) continue;
        for (const m of body.matchAll(re)) {
          if (m[1] !== allow) links.push({ severity: 'error', file, message: `${file} links into ${dir} (\`${m[1]}\`) from outside it — a plan is deleted when its work ends, so nothing may point at one. Cite the document that owns the durable fact instead.`, ruleId: options.id });
        }
      }
    }

    // Placement is ratcheted; an inbound link never is. A passing verdict's error
    // lines are the placement violations the ratchet tolerates — frame them.
    const ok = placement.length <= ratchet && links.length === 0;
    return frameTolerated(ok, [...placement, ...links], `the placement ratchet ${ratchet}`);
  });
}
