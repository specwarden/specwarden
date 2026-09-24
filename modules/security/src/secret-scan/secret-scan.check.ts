import type { ICheck, ICorpusFloor, IFinding, IModuleCheckDeclaration, TPathspecs } from 'specwarden';
import {
  CheckOptionsError,
  type ICatalogOptions,
  belowCorpusFloor,
  buildCheck,
  catalogNotes,
  checkOptions,
  resolveCatalog,
  thresholdOf,
  verdictFrom,
  withExaminedNote,
} from 'specwarden';

export interface ISecretAllowEntry {
  /** The exact file a known match is allowed in (never a prefix — an allowlisted
   * path must not quietly cover a new secret elsewhere). */
  readonly file: string;
  /** The pattern id it is allowed for, or `*` for any. */
  readonly patternId: string;
  /** Why this file necessarily carries the pattern — kept beside the entry, so the
   * allowlist stays auditable. */
  readonly why?: string;
}

export interface ISecretScanOptions extends IModuleCheckDeclaration {
  /** git pathspec(s) of the corpus to scan. Tracked files only — a pasted credential in an
   * untracked file is caught once it is added, and node_modules never is. Default: every
   * tracked file. */
  readonly files?: TPathspecs;
  /** Pathspecs left out, ON TOP of `DEFAULT_SECRET_EXCEPT` (lockfiles, build output, binary
   * and media files) — a file that is left out is never read, whatever it holds. */
  readonly except?: readonly string[];
  /** Known-safe matches, each pinned to an exact file and a pattern. Not an exemption: the
   * file is still scanned for every other pattern. */
  readonly allowlist?: readonly ISecretAllowEntry[];
  /** Files larger than this are not where a pasted secret hides. */
  readonly maxBytes?: number;
  /** How many files a run must scan. Default: at least 1. */
  readonly corpus?: ICorpusFloor;
  /** Add to, disable, or replace `BUILT_IN_SECRET_PATTERNS`. Every deviation is
   * reported as an info finding — a scanner that quietly stopped looking for
   * something reads exactly like one that found nothing. */
  readonly patterns?: ICatalogOptions<ISecretPattern>;
  /** Replaces `DEFAULT_PLACEHOLDER_MARKERS`; a line matching it is never a secret. */
  readonly placeholderMarkers?: RegExp;
}

/** One credential shape. `id` is how a caller disables or overrides it, so it is
 * part of the contract: renaming one breaks a consumer's config silently. */
export interface ISecretPattern {
  readonly id: string;
  readonly label: string;
  readonly re: RegExp;
}

/**
 * A PRESET, not a mandate — the vendors this engine happens to know.
 *
 * Shipping it is right: a repository that had to supply the AWS key format before it
 * could scan for anything would simply not scan. Imposing it is not. These are five
 * vendors out of thousands, and a consumer who uses none of them is being made to
 * carry patterns that can only cost it false positives — while the format it DOES
 * use, an internal token shape this package has never heard of, goes unscanned.
 *
 * So it is exported, and every entry is reachable by id through `patterns`:
 * `extra` to add, `disable` to switch one off with a reason, `replace` to supply
 * the whole library. Passing `replace: []` scans for nothing and says so out loud.
 */
export const BUILT_IN_SECRET_PATTERNS: readonly ISecretPattern[] = [
  { id: 'telegram-bot-token', label: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/ },
  { id: 'aws-access-key-id', label: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    id: 'private-key-block',
    label: 'private key block',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    id: 'slack-webhook',
    label: 'Slack webhook URL',
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{7,}\/B[A-Z0-9]{7,}\/[A-Za-z0-9]{20,}/,
  },
  {
    id: 'secret-env-assignment',
    label: 'value assigned to a known secret env key',
    // NAME ending PASSWORD/SECRET/TOKEN next to a value that looks random rather
    // than readable: 24+ hex, or 16+ mixed containing both a digit and an uppercase.
    // `[A-Z0-9_]*` (not `[A-Z]…`) so a bare `PASSWORD=`/`SECRET=`/`TOKEN=` — no prefix
    // — is caught too, not only a prefixed `DB_PASSWORD`. `\b` still anchors the name.
    re: new RegExp(
      String.raw`\b[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN)\s*[=:]\s*['"]?(?:` +
        String.raw`[0-9a-f]{24,}` +
        String.raw`|(?=[A-Za-z0-9/+_.-]*[0-9])(?=[A-Za-z0-9/+_.-]*[A-Z])[A-Za-z0-9/+_.-]{16,}` +
        String.raw`)['"]?`,
    ),
  },
];

/**
 * Anything template- or example-shaped is not a secret.
 *
 * The default vocabulary is English and conventional (`EXAMPLE`, `CHANGEME`,
 * `YOUR_`). A repository whose placeholders read `ZAMENI_MENYA` gets false positives
 * from a table it cannot reach, so `placeholderMarkers` overrides it.
 */
export const DEFAULT_PLACEHOLDER_MARKERS =
  /\$\{|<[a-z_-]+>|PLACEHOLDER|NOT_CONFIGURED|EXAMPLE|CHANGEME|YOUR_|\bxxx+\b|\bXXX+\b/;

/**
 * The nested options a scan's author writes by hand, checked by name like the top level.
 *
 * `patterns.add` was the GUIDE's spelling of `patterns.extra`. Nothing read `add`, so the
 * pattern the author added was never scanned for, and a planted key of exactly that shape
 * stayed green — the one silent failure a credential scanner cannot have.
 */
function checkNested(options: ISecretScanOptions): void {
  const who = `secretScan${options.id ? ` '${options.id}'` : ''}`;
  const problems: string[] = [];
  const patterns = (options.patterns ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(patterns)) {
    if (!['extra', 'disable', 'replace'].includes(key)) {
      problems.push(`\`patterns.${key}\` is not an option — \`patterns\` takes extra, disable and replace`);
    } else if (patterns[key] !== undefined && !Array.isArray(patterns[key])) {
      problems.push(`\`patterns.${key}\` must be an array`);
    }
  }
  (options.allowlist ?? []).forEach((entry, index) => {
    const given = entry as unknown as Record<string, unknown>;
    for (const key of Object.keys(given)) {
      if (!['file', 'patternId', 'why'].includes(key)) {
        problems.push(`\`allowlist[${index}].${key}\` is not an option — an entry takes file, patternId and why`);
      }
    }
    for (const key of ['file', 'patternId']) {
      if (typeof given[key] !== 'string') problems.push(`\`allowlist[${index}].${key}\` must be a string`);
    }
  });
  if (problems.length > 0) throw new CheckOptionsError(`${who}: ${problems.join('; ')}.`);
}

/**
 * What a scan never reads: lockfiles (integrity hashes are credential-shaped noise), build
 * and dependency output, and binary or media files. A consumer's `except` is ADDED to these.
 *
 * They were two lists — path fragments and file extensions — each of which a consumer could
 * replace, and replacing one to add a folder dropped every lockfile from the other's
 * protection. One list of pathspecs, the engine's spelling of "leave these out", is the
 * whole of it.
 */
export const DEFAULT_SECRET_EXCEPT: readonly string[] = [
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  ...['png', 'jpg', 'jpeg', 'gif', 'ico', 'pdf', 'zip', 'gz', 'woff', 'woff2', 'ttf', 'eot', 'mp4', 'webp', 'avif'].map(
    (ext) => `**/*.${ext}`,
  ),
  '**/*.tsbuildinfo',
];

/**
 * Refuses a credential-shaped string in the repository. GitHub push protection
 * covers this on public repos with Advanced Security; this is free, sub-second, and
 * matches the formats a project actually handles. A pattern is anchored to a format
 * specific enough that a match means something — a noisy guard is a disabled guard.
 *
 * A PRODUCT check: the credential library and placeholder suppression are universal;
 * the corpus, what it leaves out and the allowlist are options.
 */
export function secretScan(options: ISecretScanOptions = {}): ICheck {
  checkOptions('secretScan', options, {
    files: { kind: ['string', 'array'], nonEmpty: true },
    except: { kind: 'array' },
    allowlist: { kind: 'array' },
    maxBytes: { kind: 'number' },
    patterns: { kind: 'object' },
    placeholderMarkers: { kind: 'regexp' },
    corpus: { kind: 'object' },
    zone: { refused: "a module's check speaks for its module, so its zone is `product`" },
  });
  checkNested(options);
  const pathspecs =
    options.files === undefined ? [''] : typeof options.files === 'string' ? [options.files] : options.files;
  const except = [...DEFAULT_SECRET_EXCEPT, ...(options.except ?? [])];
  const allowlist = options.allowlist ?? [];
  const maxBytes = options.maxBytes ?? 1024 * 1024;

  const catalog = resolveCatalog(BUILT_IN_SECRET_PATTERNS, options.patterns, 'credential pattern');
  // Every pattern is `.test`ed line after line, so a consumer's `/g` or `/y` is stripped: the
  // flag makes `.test` resume from `lastIndex`, and the scan MISSED every second credential
  // in a file — the one silent failure a credential scanner cannot have.
  const stateless = (re: RegExp): RegExp =>
    re.global || re.sticky ? new RegExp(re.source, re.flags.replace(/[gy]/g, '')) : re;
  const patterns = catalog.entries.map((pattern) => ({ ...pattern, re: stateless(pattern.re) }));
  const placeholders = stateless(options.placeholderMarkers ?? DEFAULT_PLACEHOLDER_MARKERS);

  const allowed = (file: string, patternId: string): boolean =>
    allowlist.some((e) => e.file === file && (e.patternId === '*' || e.patternId === patternId));

  return buildCheck(
    {
      ...options,
      id: options.id ?? 'secret-scan',
      rule: options.rule ?? {
        statement: 'no credential is committed to the repository',
        owner: '@specwarden/security',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self) => {
      // The deviations lead, before any match: a scanner that stopped looking for
      // something must not read like one that looked and found nothing.
      const findings: IFinding[] = [...catalogNotes(catalog.notes)];
      const exempt = new Set(except.flatMap((spec) => [...ctx.vcs.trackedFiles(spec)]));
      const selected = [...new Set(pathspecs.flatMap((spec) => [...ctx.vcs.trackedFiles(spec)]))].sort();
      let scanned = 0;
      for (const file of selected) {
        if (exempt.has(file)) continue;
        const content = ctx.files.tryRead(file);
        if (content === undefined || content.length > maxBytes || content.includes('\0')) continue;
        scanned++;
        content.split('\n').forEach((line, index) => {
          for (const pattern of patterns) {
            if (!pattern.re.test(line) || placeholders.test(line) || allowed(file, pattern.id)) continue;
            findings.push({
              severity: 'error',
              file,
              line: index + 1,
              message: `${file}:${index + 1} — ${pattern.label} [${pattern.id}]. If real, ROTATE it before deleting the line; if a placeholder, add it to the allowlist with a reason.`,
            });
          }
        });
      }
      // Zero files scanned is a failure, not a clean tree: a `files` pathspec that matched
      // nothing, or an `except` that swallowed everything, reports "no credentials" about a
      // corpus of none — the one verdict a credential scan must never give falsely.
      const named = options.files === undefined ? 'every tracked file' : pathspecs.map((p) => `\`${p}\``).join(', ');
      const floor = belowCorpusFloor(
        self.id,
        scanned,
        options.corpus,
        `${named}, less \`except\` and the default exemptions, left nothing to scan`,
      );
      if (floor) return { ...floor, findings: [...findings, ...floor.findings] };
      return verdictFrom(withExaminedNote(findings, self.id, scanned), thresholdOf(ctx, self));
    },
  );
}
