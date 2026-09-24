import {
  type ICheck,
  type ICorpusFloor,
  type IFinding,
  type IModuleCheckDeclaration,
  type IVerdict,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  thresholdOf,
  verdictFrom,
  withExaminedNote,
} from 'specwarden';
import { MODULE_OPTIONS, failure, lineWhere, note, opsIdentity } from '../_shared/identity/identity.util';

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
 * THE CORPUS IS THE COMPOSE FILE'S SERVICES, not the env files. The compose file is
 * tracked, so a run that read no service from it is `composeFile` pointed at the wrong
 * place — refused on the corpus floor. The env files are this machine's, so their absence
 * is the skip above, never the corpus floor.
 *
 * WHAT IS CONFIGURATION: which compose file, which modes exist, which service is the
 * verifier, and WHICH KEYS the application declares. That last one is the sharpest
 * boundary: how a consumer declares its env keys — a TS constant, a schema, a dotenv sample —
 * is its own business, so the caller passes the resulting set and keeps the parsing.
 */

export interface IComposeService {
  readonly envFiles: readonly string[];
  readonly mounts: readonly string[];
}

export interface IEnvPairingOptions extends IModuleCheckDeclaration {
  /** The compose file describing which services load which env files. */
  readonly composeFile: string;
  /** The deployment modes whose files are compared, substituted into `${MODE}`. */
  readonly modes: readonly string[];
  /** The service that VERIFIES a handshake key another service sends. */
  readonly verifierService: string;
  /** The keys the application declares, however the consumer declares them. */
  readonly declaredKeys: (read: (path: string) => string | undefined) => ReadonlySet<string>;
  /** How many compose services a run must read. Default: at least 1. */
  readonly corpus?: ICorpusFloor;
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

const ENV_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/;

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
    const match = ENV_LINE.exec(line);
    if (!match) continue;
    entries.set(match[1] as string, (match[2] as string).trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  return entries;
}

/** The line a key is (last) set on — the occurrence a loader keeps, and so the one to edit. */
function lineOfKey(source: string, key: string): number | undefined {
  let found: number | undefined;
  source.split('\n').forEach((raw, index) => {
    if (ENV_LINE.exec(raw.replace(/\r$/, ''))?.[1] === key) found = index + 1;
  });
  return found;
}

/**
 * A mounted file this check reads for interpolations: a config by extension, or a proxy
 * config by its canonical name. `Caddyfile` has no extension, so a stack mounting one —
 * the name the module's own upstream check reads — was never read at all.
 */
const INTERPOLATED = /\.(?:ya?ml|json|conf|caddy)$|(?:^|\/)Caddyfile(?:\.[\w-]+)?$/;

/** `${VAR}` (compose, most templating) and `{$VAR}` / `{$VAR:default}` (Caddy). */
const INTERPOLATION = /\$\{([A-Z][A-Z0-9_]*)\}|\{\$([A-Z][A-Z0-9_]*)(?::[^}]*)?\}/g;

interface IEnvFile {
  readonly source: string;
  readonly env: Map<string, string>;
}

export function envPairing(options: IEnvPairingOptions): ICheck {
  checkOptions('envPairing', options, {
    ...MODULE_OPTIONS,
    composeFile: { kind: 'string', required: true, nonEmpty: true },
    modes: { kind: 'array', required: true, nonEmpty: true },
    // A scaffold writes `verifierService: ''` for the consumer to fill in. Left empty it was
    // looked up as a service and reported as "service `` declares no env_file" — a finding
    // about a name nobody wrote. It is refused where it was written instead.
    verifierService: { kind: 'string', required: true, nonEmpty: true },
    declaredKeys: { kind: 'function', required: true },
  });

  return buildCheck(
    opsIdentity(
      options,
      'env-pairing',
      'a variable one service sends is set where the service that verifies it reads it',
    ),
    ['read'],
    (ctx, self): IVerdict => {
      const read = (path: string): string | undefined => ctx.files.tryRead(path);
      const findings: IFinding[] = [];
      let compared = 0;

      const composeSource = read(options.composeFile);
      const compose = parseCompose(composeSource ?? '');
      const floor = belowCorpusFloor(
        self.id,
        compose.size,
        options.corpus,
        composeSource === undefined
          ? `\`${options.composeFile}\` could not be read`
          : `\`${options.composeFile}\` declares no service under \`services:\``,
        'compose service',
      );
      if (floor) return floor;
      if (compose.size === 0) return { ok: true, findings: withExaminedNote([], self.id, 0, 'compose service') };

      const declared = options.declaredKeys(read);

      /** The interpolations of every repo config file mounted into a service, with where. */
      const interpolatedByService = new Map<string, Map<string, { file: string; line: number }>>();
      for (const [service, { mounts }] of compose) {
        const vars = new Map<string, { file: string; line: number }>();
        for (const mount of mounts) {
          if (!INTERPOLATED.test(mount)) continue;
          const mounted = read(mount);
          if (mounted === undefined) continue;
          for (const m of mounted.matchAll(INTERPOLATION)) {
            const key = (m[1] ?? m[2]) as string;
            if (!vars.has(key)) vars.set(key, { file: mount, line: mounted.slice(0, m.index).split('\n').length });
          }
        }
        if (vars.size > 0) interpolatedByService.set(service, vars);
      }

      const verifier = compose.get(options.verifierService);
      if (verifier === undefined || verifier.envFiles.length === 0) {
        const line = lineWhere(composeSource as string, (l) => l === `  ${options.verifierService}:`);
        findings.push(
          failure(
            `${options.composeFile}: service \`${options.verifierService}\` ` +
              `${verifier === undefined ? 'is not declared' : 'declares no env_file'} — name in \`verifierService\` ` +
              'the service that verifies a key another service sends, and give it the env_file it reads.',
            options.composeFile,
            line,
          ),
        );
        return verdictFrom(findings, thresholdOf(ctx, self));
      }

      for (const mode of options.modes) {
        // EVERY occurrence: `replace` with a string pattern substitutes only the first, so
        // `${MODE}/.env.${MODE}` resolved to `prod/.env.${MODE}` — a file that never exists,
        // and a mode reported SKIPPED over files that were right there.
        const forMode = (template: string): string => template.replaceAll('${MODE}', mode);

        const loaded = new Map<string, IEnvFile>();
        for (const [, { envFiles }] of compose) {
          for (const template of envFiles) {
            const path = forMode(template);
            if (loaded.has(path)) continue;
            const source = read(path);
            if (source !== undefined) loaded.set(path, { source, env: parseEnvFile(source) });
          }
        }

        if (loaded.size < 2) {
          findings.push(
            note(
              `${mode}: SKIPPED — ${loaded.size} of the mode's env files exist here ` +
                '(they are gitignored; this rule can only run where they live).',
            ),
          );
          continue;
        }
        findings.push(note(`${mode}: checked ${loaded.size} env files — ${[...loaded.keys()].join(', ')}`));
        compared += 1;

        /** What a service sees: every env file it loads, the later one winning. */
        const envOf = (service: string): { paths: string[]; env: Map<string, string> } => {
          const paths = (compose.get(service) as IComposeService).envFiles.map(forMode).filter((p) => loaded.has(p));
          const env = new Map<string, string>();
          for (const path of paths) for (const [key, value] of (loaded.get(path) as IEnvFile).env) env.set(key, value);
          return { paths, env };
        };

        // The named rules run FIRST: they say which service and which consequence, so a key
        // they already explained must not be reported again by the generic comparison.
        const explained = new Set<string>();

        for (const [service, vars] of interpolatedByService) {
          const own = envOf(service);
          if (own.paths.length === 0) continue;
          for (const [key, at] of vars) {
            if (own.env.get(key)) continue;
            explained.add(key);
            findings.push(
              failure(
                `${mode}: ${key} is interpolated by ${service}'s mounted config but is ` +
                  `missing or empty in ${own.paths.join(', ')} — set it there, or the substitution yields an empty string.`,
                at.file,
                at.line,
              ),
            );
          }
        }

        // THE HEADLINE DEFECT: a key the application declares, set for a service that sends
        // it, and missing — or empty — where the verifier reads it. It was found only when
        // the sender's mounted config interpolated the key, so the stack with no mount, the
        // commonest one, was green over exactly the defect this check is named for.
        const verifierEnv = envOf(options.verifierService);
        if (verifierEnv.paths.length === 0) {
          findings.push(
            note(
              `${mode}: ${forMode(verifier.envFiles[0] as string)} (read by ${options.verifierService}) is not here — ` +
                'what the verifier holds could not be compared.',
            ),
          );
        } else {
          for (const [service] of compose) {
            if (service === options.verifierService) continue;
            for (const path of envOf(service).paths) {
              if (verifierEnv.paths.includes(path)) continue;
              const sent = loaded.get(path) as IEnvFile;
              for (const [key, value] of sent.env) {
                if (!value || !declared.has(key) || explained.has(key) || verifierEnv.env.get(key)) continue;
                explained.add(key);
                const target = verifierEnv.paths[verifierEnv.paths.length - 1] as string;
                findings.push(
                  failure(
                    `${mode}: ${key} is set in ${path} (sent by ${service}) but missing or empty in ` +
                      `${verifierEnv.paths.join(', ')} (verified by ${options.verifierService}). The verifier ` +
                      `boots green and rejects every request carrying it — set it in ${target}.`,
                    target,
                    lineOfKey((loaded.get(target) as IEnvFile).source, key),
                  ),
                );
              }
            }
          }
        }

        const paths = [...loaded.keys()];
        for (let i = 0; i < paths.length; i += 1) {
          for (let j = i + 1; j < paths.length; j += 1) {
            const a = paths[i] as string;
            const b = paths[j] as string;
            for (const [key, value] of (loaded.get(a) as IEnvFile).env) {
              if (explained.has(key)) continue;
              const other = (loaded.get(b) as IEnvFile).env;
              if (!other.has(key) || other.get(key) === value) continue;
              findings.push(
                failure(
                  `${mode}: ${key} differs between ${a} and ${b}. One stack loads both files, so ` +
                    'whichever service reads the stale value fails against the other — give both the same ' +
                    'value, or give each service its own key.',
                  b,
                  lineOfKey((loaded.get(b) as IEnvFile).source, key),
                ),
              );
            }
          }
        }
      }

      // Every mode absent is a run that compared nothing: not a pass — it was one, a green
      // tick beside a note reading SKIPPED — and not a failure, on a checkout that
      // never has the files. The engine reports it as skipped, `cannot-tell`.
      // The failures lead, the notes about what was compared follow: a reader — and a spec —
      // reaches for the first line of a red verdict, and it must be the defect.
      const ordered = [
        ...findings.filter((f) => f.severity === 'error'),
        ...findings.filter((f) => f.severity !== 'error'),
      ];
      const verdict = verdictFrom(
        withExaminedNote(ordered, self.id, compose.size, 'compose service'),
        thresholdOf(ctx, self),
      );
      return verdict.ok && compared === 0
        ? {
            ...verdict,
            findings: findings,
            skipped: `no mode's env files are here (${options.modes.join(', ')}) — run it where they live`,
          }
        : verdict;
    },
  );
}
