import type { ICheck, ICheckIdentity, IFinding } from 'specwarden';
import { type ICatalogOptions, buildCheck, catalogNotes, resolveCatalog, verdictFrom } from 'specwarden';

export interface ISecretAllowEntry {
  /** The exact file a known match is allowed in (never a prefix — an allowlisted
   * path must not quietly cover a new secret elsewhere). */
  readonly file: string;
  /** The pattern id it is allowed for, or `*` for any. */
  readonly patternId: string;
}

export interface ISecretScanOptions extends ICheckIdentity {
  /** git pathspec of the corpus to scan. Tracked files only — a pasted credential
   * in an untracked file is caught once it is added, and node_modules never is. */
  readonly scan?: string;
  /** Path prefixes/fragments skipped (lockfiles, build output). */
  readonly skipPaths?: readonly string[];
  /** File extensions skipped (binary, media). */
  readonly skipExtensions?: readonly string[];
  /** Known-safe matches, each pinned to an exact file. */
  readonly allowlist?: readonly ISecretAllowEntry[];
  /** Files larger than this are not where a pasted secret hides. */
  readonly maxBytes?: number;
  readonly ratchet?: number;
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
  { id: 'private-key-block', label: 'private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'slack-webhook', label: 'Slack webhook URL', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{7,}\/B[A-Z0-9]{7,}\/[A-Za-z0-9]{20,}/ },
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
export const DEFAULT_PLACEHOLDER_MARKERS = /\$\{|<[a-z_-]+>|PLACEHOLDER|NOT_CONFIGURED|EXAMPLE|CHANGEME|YOUR_|\bxxx+\b|\bXXX+\b/;

/**
 * Refuses a credential-shaped string in the repository. GitHub push protection
 * covers this on public repos with Advanced Security; this is free, sub-second, and
 * matches the formats a project actually handles. A pattern is anchored to a format
 * specific enough that a match means something — a noisy guard is a disabled guard.
 *
 * A PRODUCT check: the credential library and placeholder suppression are universal;
 * the allowlist, the skipped paths and the corpus are options.
 */
export function secretScan(options: ISecretScanOptions): ICheck {
  const skipPaths = options.skipPaths ?? ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', '.git/', 'node_modules/', 'dist/', 'coverage/'];
  const skipExt = new Set(options.skipExtensions ?? ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.webp', '.avif', '.tsbuildinfo']);
  const allowlist = options.allowlist ?? [];
  const maxBytes = options.maxBytes ?? 1024 * 1024;

  const catalog = resolveCatalog(BUILT_IN_SECRET_PATTERNS, options.patterns, 'credential pattern');
  const patterns = catalog.entries;
  const placeholders = options.placeholderMarkers ?? DEFAULT_PLACEHOLDER_MARKERS;

  const allowed = (file: string, patternId: string): boolean => allowlist.some((e) => e.file === file && (e.patternId === '*' || e.patternId === patternId));
  const extOf = (f: string): string => { const b = f.slice(f.lastIndexOf('/') + 1); const d = b.lastIndexOf('.'); return d === -1 ? '' : b.slice(d).toLowerCase(); };
  const skip = (f: string): boolean => skipPaths.some((p) => f.startsWith(p) || f.includes(`/${p}`)) || skipExt.has(extOf(f));

  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx) => {
    // The deviations lead, before any match: a scanner that stopped looking for
    // something must not read like one that looked and found nothing.
    const findings: IFinding[] = [...catalogNotes(catalog.notes)];
    for (const file of ctx.vcs.trackedFiles(options.scan ?? '')) {
      if (skip(file)) continue;
      const content = ctx.files.tryRead(file);
      if (content === undefined || content.length > maxBytes || content.includes('\0')) continue;
      content.split('\n').forEach((line, index) => {
        for (const pattern of patterns) {
          if (!pattern.re.test(line) || placeholders.test(line) || allowed(file, pattern.id)) continue;
          findings.push({ severity: 'error', file, line: index + 1, message: `${file}:${index + 1} — ${pattern.label} [${pattern.id}]. If real, ROTATE it before deleting the line; if a placeholder, add it to the allowlist with a reason.`, ruleId: options.id });
        }
      });
    }
    return verdictFrom(findings, ctx.ratchet ?? options.ratchet);
  });
}
