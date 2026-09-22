import type { IFileSource } from '../ports/file-source/file-source.port';

/**
 * The harvest gate — archiving a plan refuses to run until its harvest is declared,
 * meaning every fact that lives ONLY in the plan has moved to the document that
 * owns it. Today "harvest first" is discipline and cannot be checked; here it is a
 * precondition of the state transition.
 *
 * "Harvested: yes" is NOT accepted — a bare claim is a check that cannot fail, the
 * failure family the whole product is built against. Only "what → where" is
 * accepted, and the destination must exist: a harvest that names a document is
 * falsifiable, a harvest that says "yes" is not.
 *
 *   ## Harvest
 *   - the retry decision → docs/ARCHITECTURE.md
 *   - the build rationale → scripts/build.mjs
 */
export interface IHarvestEntry {
  readonly what: string;
  readonly where: string;
  readonly line: number;
}

const HARVEST_HEADING_RE = /^#{1,6}\s+Harvest\b/i;
const HARVEST_ENTRY_RE = /^\s*[-*]\s*(.+?)\s*(?:→|-->|->)\s*(\S.*?)\s*$/;
const BARE_CLAIM_RE = /^\s*[-*]?\s*harvested\s*[:=]\s*(yes|true|done)\s*$/i;

export interface IHarvestParse {
  readonly entries: readonly IHarvestEntry[];
  /** Lines under the harvest heading that assert completion without naming a
   * destination — the un-falsifiable claim the gate refuses. */
  readonly bareClaims: readonly number[];
  /** Whether a harvest section was present at all. */
  readonly present: boolean;
}

/** Parse the harvest section: its "what → where" entries and any bare claims. */
export function parseHarvest(text: string): IHarvestParse {
  const lines = text.split('\n');
  const entries: IHarvestEntry[] = [];
  const bareClaims: number[] = [];
  let inSection = false;
  let present = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (HARVEST_HEADING_RE.test(line)) {
      inSection = true;
      present = true;
      continue;
    }
    if (inSection && /^#{1,6}\s/.test(line)) inSection = false; // next heading ends the section
    if (!inSection) continue;
    if (BARE_CLAIM_RE.test(line)) {
      bareClaims.push(i + 1);
      continue;
    }
    const m = HARVEST_ENTRY_RE.exec(line);
    if (m) entries.push({ what: m[1].trim(), where: m[2].trim(), line: i + 1 });
  }
  return { entries, bareClaims, present };
}

export interface IArchiveReadiness {
  readonly ready: boolean;
  readonly reasons: readonly string[];
}

/**
 * Decide whether a plan may be archived. Ready only when a harvest section exists,
 * carries at least one "what → where" entry, names no bare claim, and every named
 * destination resolves.
 */
export function archiveReadiness(text: string, files: IFileSource): IArchiveReadiness {
  const harvest = parseHarvest(text);
  const reasons: string[] = [];
  if (!harvest.present) reasons.push('no Harvest section — archiving requires declaring what moved and where.');
  for (const line of harvest.bareClaims) reasons.push(`line ${line}: "harvested: yes" is not accepted — name what moved and to which document (a claim that cannot be falsified is a check that cannot fail).`);
  if (harvest.present && harvest.entries.length === 0 && harvest.bareClaims.length === 0) reasons.push('the Harvest section names no "what → where" entry.');
  for (const e of harvest.entries) {
    const dest = e.where.split('§')[0].split('#')[0].trim();
    if ((dest.includes('/') || dest.endsWith('.md')) && !files.exists(dest)) reasons.push(`line ${e.line}: harvest destination "${dest}" does not exist.`);
  }
  return { ready: reasons.length === 0, reasons };
}
