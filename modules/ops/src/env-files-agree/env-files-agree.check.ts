import { CHECK_CONTRACT_VERSION, type ICheck, type IVerdict, type TTier } from 'specwarden';

/**
 * Env files that one stack loads together agree on every key they share, and a key one
 * service SENDS is present for the service that VERIFIES it.
 *
 * THE DEFECT. A compose stack loads several env files at once, and nothing compares them.
 * Two files of one mode holding different values for the same key produce a service that
 * boots green and refuses every request carrying that value — the sender signs with one
 * secret, the verifier checks against another, and both sides log success at their own
 * layer. The same shape appears when a key is interpolated into a mounted config but left
 * empty in the file that service reads: the container starts, the substitution yields an
 * empty string, and the failure surfaces as a permission error somewhere else entirely.
 *
 * WHY IT RUNS EVEN WHEN IT CAN SEE NOTHING. Env files are gitignored, so a change to one
 * never appears in a diff and no relevance predicate can catch it. The check therefore runs
 * always and reports SKIPPED per mode where the files are absent — an honest "cannot tell"
 * rather than a green it did not earn.
 *
 * WHAT IS CONFIGURATION: which compose file, which modes exist, which service is the
 * verifier, and WHICH KEYS the application declares. That last one is the sharpest
 * boundary: how a host declares its env keys — a TS constant, a schema, a dotenv sample —
 * is its own business, so the caller passes the resulting set and keeps the parsing.
 */

export interface IComposeService {
  readonly envFiles: readonly string[];
  readonly mounts: readonly string[];
}

export interface IEnvFilesAgreeOptions {
  readonly id: string;
  readonly title: string;
  readonly tier?: TTier;
  readonly hint?: string;
  /** The compose file describing which services load which env files. */
  readonly composeFile: string;
  /** The deployment modes whose files are compared, substituted into `${MODE}`. */
  readonly modes: readonly string[];
  /** The service that VERIFIES a handshake key another service sends. */
  readonly verifierService: string;
  /** The keys the application declares, however the host declares them. */
  readonly declaredKeys: (read: (path: string) => string | undefined) => ReadonlySet<string>;
  readonly when: (changed: readonly string[]) => boolean;
}

/**
 * Services of a compose file with their `env_file` templates and the repo paths they
 * bind-mount. Line-scanned: compose is 2-space indented and regular, which is the whole
 * grammar needed, and it keeps this dependency-free.
 */
export function parseCompose(source: string): Map<string, IComposeService> {
  const services = new Map<string, IComposeService>();
  const lines = source.split('\n');
  const start = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (start === -1) return services;

  let current: { name: string; envFiles: string[]; mounts: string[] } | null = null;
  let section: 'env_file' | 'volumes' | null = null;

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (/^\S/.test(line)) break; // left the services block

    const header = /^ {2}([a-z][\w-]*):\s*$/.exec(line);
    if (header) {
      if (current) services.set(current.name, { envFiles: current.envFiles, mounts: current.mounts });
      current = { name: header[1] as string, envFiles: [], mounts: [] };
      section = null;
      continue;
    }
    if (!current) continue;

    if (/^ {4}env_file:/.test(line)) {
      section = 'env_file';
      const inline = /^ {4}env_file:\s*(\S+)\s*$/.exec(line);
      if (inline) current.envFiles.push(inline[1] as string);
      continue;
    }
    if (/^ {4}volumes:/.test(line)) {
      section = 'volumes';
      continue;
    }
    if (/^ {4}\w/.test(line)) {
      section = null;
      continue;
    }

    const item = /^ {6}-\s*(\S+)/.exec(line);
    if (!item) continue;
    // `./x` and `x` are the same file, and these strings are used as MAP KEYS — one
    // spelling per file, or two entries of one file compare against each other and a
    // shared key is reported as differing from itself.
    if (section === 'env_file') current.envFiles.push((item[1] as string).replace(/^\.\//, ''));
    if (section === 'volumes') {
      const mounted = (item[1] as string).split(':')[0] as string;
      // A named volume (`data:/var/lib`) is not a repo path and has nothing to interpolate.
      if (mounted.startsWith('./')) current.mounts.push(mounted.replace(/^\.\//, ''));
    }
  }
  if (current) services.set(current.name, { envFiles: current.envFiles, mounts: current.mounts });

  return services;
}

/**
 * `KEY=value` pairs of an env file, comments and blanks dropped.
 *
 * Four details, each one a way two identical values compare as different:
 * a trailing `\r` on a CRLF file, an `export ` prefix, surrounding quotes, and a duplicate
 * key — judged by its LAST occurrence, because that is what a loader keeps.
 */
export function parseEnvFile(source: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const raw of source.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    entries.set(match[1] as string, (match[2] as string).trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  return entries;
}

export function envFilesAgree(options: IEnvFilesAgreeOptions): ICheck {
  return {
    id: options.id,
    title: options.title,
    tier: options.tier ?? 'fast',
    zone: 'product',
    capabilities: ['read'],
    contractVersion: CHECK_CONTRACT_VERSION,
    hint: options.hint,
    when: options.when,
    run: (ctx): IVerdict => {
      const read = (path: string): string | undefined => ctx.files.tryRead(path);
      const failures: string[] = [];
      const notes: string[] = [];

      const composeSource = read(options.composeFile);
      if (composeSource === undefined) {
        return {
          ok: false,
          findings: [
            {
              severity: 'error',
              message: `${options.composeFile} cannot be read — this check compared nothing`,
              ruleId: options.id,
            },
          ],
        };
      }

      const compose = parseCompose(composeSource);
      const declared = options.declaredKeys(read);

      /** `${VAR}` interpolations of every repo config file mounted into a service. */
      const interpolatedByService = new Map<string, Set<string>>();
      for (const [service, { mounts }] of compose) {
        const vars = new Set<string>();
        for (const mount of mounts) {
          if (!/\.(ya?ml|json|conf|caddy)$/.test(mount)) continue;
          const mounted = read(mount);
          if (mounted === undefined) continue;
          for (const m of mounted.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)) vars.add(m[1] as string);
        }
        if (vars.size > 0) interpolatedByService.set(service, vars);
      }

      const verifierTemplate = compose.get(options.verifierService)?.envFiles[0];
      if (verifierTemplate === undefined) {
        failures.push(`${options.composeFile}: service \`${options.verifierService}\` declares no env_file.`);
        return verdictOf(failures, notes, options.id);
      }

      for (const mode of options.modes) {
        const forMode = (template: string): string => template.replace('${MODE}', mode);

        const loaded = new Map<string, Map<string, string>>();
        for (const [, { envFiles }] of compose) {
          for (const template of envFiles) {
            const path = forMode(template);
            if (loaded.has(path)) continue;
            const source = read(path);
            if (source !== undefined) loaded.set(path, parseEnvFile(source));
          }
        }

        if (loaded.size < 2) {
          notes.push(
            `${mode}: SKIPPED — ${loaded.size} of the mode's env files exist here ` +
              '(they are gitignored; this rule can only run where they live).',
          );
          continue;
        }
        notes.push(`${mode}: checked ${loaded.size} env files — ${[...loaded.keys()].join(', ')}`);

        // The named rules run FIRST: they say which service and which consequence, so a key
        // they already explained must not be reported again by the generic comparison.
        const explained = new Set<string>();
        const verifierPath = forMode(verifierTemplate);

        for (const [service, vars] of interpolatedByService) {
          const template = compose.get(service)?.envFiles[0];
          if (template === undefined) continue;
          const servicePath = forMode(template);
          const serviceEnv = loaded.get(servicePath);
          if (!serviceEnv) continue;

          for (const key of vars) {
            if (!serviceEnv.get(key)) {
              explained.add(key);
              failures.push(
                `${mode}: ${key} is interpolated by ${service}'s mounted config but is ` +
                  `missing or empty in ${servicePath}.`,
              );
              continue;
            }
            if (!declared.has(key) || servicePath === verifierPath) continue;

            const verifierEnv = loaded.get(verifierPath);
            if (!verifierEnv) continue;
            if (!verifierEnv.get(key)) {
              explained.add(key);
              failures.push(
                `${mode}: ${key} is set in ${servicePath} (sent by ${service}) but missing or ` +
                  `empty in ${verifierPath} (verified by ${options.verifierService}). The verifier ` +
                  'boots green and rejects every request carrying it.',
              );
            }
          }
        }

        const paths = [...loaded.keys()];
        for (let i = 0; i < paths.length; i += 1) {
          for (let j = i + 1; j < paths.length; j += 1) {
            const a = paths[i] as string;
            const b = paths[j] as string;
            for (const [key, value] of loaded.get(a) as Map<string, string>) {
              if (explained.has(key)) continue;
              const other = loaded.get(b) as Map<string, string>;
              if (!other.has(key) || other.get(key) === value) continue;
              failures.push(
                `${mode}: ${key} differs between ${a} and ${b}. One stack loads both files; ` +
                  'whichever service reads the stale value fails against the other.',
              );
            }
          }
        }
      }

      return verdictOf(failures, notes, options.id);
    },
  };
}

function verdictOf(failures: readonly string[], notes: readonly string[], ruleId: string): IVerdict {
  const findings = [
    ...failures.map((message) => ({ severity: 'error' as const, message, ruleId })),
    ...notes.map((message) => ({ severity: 'info' as const, message })),
  ];
  return { ok: failures.length === 0, findings };
}
