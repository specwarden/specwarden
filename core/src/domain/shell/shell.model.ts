/**
 * How a command line becomes a process.
 *
 * `bash -c` is the common case and a poor assumption to hardcode: a Windows checkout
 * without Git Bash has no bash at all, some containers ship only `sh`, and a house may
 * standardise on `pwsh`. The engine had three separate `proc.run('bash', ['-c', …])`
 * call sites, which is three places to fix and three chances to fix only two.
 *
 * One type, one default, and every caller takes it as an option.
 */
export interface IShell {
  /** The executable — `bash`, `sh`, `pwsh`, `cmd`. */
  readonly command: string;
  /** The arguments that precede the command line, e.g. `['-c']`. */
  readonly args: readonly string[];
}

/** The portable default — what every platform but Windows gets, and what Windows falls
 * back to when nothing better is found. `resolveShell` is the one that looks. */
export const DEFAULT_SHELL: IShell = { command: 'bash', args: ['-c'] };

/** What `resolveShell` reads: the platform, and the environment variables it consults. */
export interface IShellEnvironment {
  readonly platform: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** The argument that makes a shell run a command line, by the shell's name. */
export function shellFlag(command: string): readonly string[] {
  const name =
    command
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.exe$/i, '')
      .toLowerCase() ?? '';
  if (name === 'pwsh' || name === 'powershell') return ['-Command'];
  if (name === 'cmd') return ['/c'];
  return ['-c'];
}

/**
 * The shell a command check runs through when the check names none.
 *
 * Everywhere but Windows this is `bash -c`. On Windows a bare `bash` is a gamble: the
 * `bash.exe` in `System32` is WSL's launcher, so on a machine with WSL installed a command
 * check runs inside Linux — where the Windows `node`, `pnpm` and the checkout's own tools
 * do not exist — and fails for a reason that has nothing to do with the repository. From
 * Git Bash the same run passes, because that PATH puts Git's bash first. A gate that
 * answers differently from PowerShell and from Git Bash is not a gate.
 *
 * So, on Windows, in order:
 *
 * 1. `SPECWARDEN_SHELL` — the executable a house chose, its flag derived from its name
 *    (`-Command` for pwsh and powershell, `/c` for cmd, `-c` for everything else);
 * 2. Git for Windows' own bash, found beside the `git` on the PATH (`…\Git\cmd`,
 *    `…\Git\bin` or `…\Git\usr\bin` → `…\Git\bin\bash.exe`) or in the usual install
 *    directories;
 * 3. `bash -c` — and the start-failure message says how to set the first.
 *
 * Pure over what it is handed, so a spec drives it with any platform and any PATH;
 * `platformShell()` in the infrastructure layer hands it the real ones.
 */
export function resolveShell(environment: IShellEnvironment, exists: (path: string) => boolean): IShell {
  if (environment.platform !== 'win32') return DEFAULT_SHELL;
  const env = environment.env;

  const chosen = env.SPECWARDEN_SHELL?.trim();
  if (chosen) return { command: chosen, args: shellFlag(chosen) };

  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path');
  const onPath = (pathKey ? (env[pathKey] ?? '') : '').split(';').filter(Boolean);
  const gitRoots = onPath
    .map((entry) => /^(.*[\\/]Git)[\\/](?:cmd|bin|usr[\\/]bin)[\\/]?$/i.exec(entry)?.[1])
    .filter((root): root is string => root !== undefined);
  const usual = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Programs`]
    .filter((dir): dir is string => Boolean(dir))
    .map((dir) => `${dir}\\Git`);

  for (const root of [...gitRoots, ...usual]) {
    const bash = `${root}\\bin\\bash.exe`;
    if (exists(bash)) return { command: bash, args: ['-c'] };
  }
  return DEFAULT_SHELL;
}

/** The argv for running `line` through `shell`. */
export function shellArgv(shell: IShell, line: string): readonly string[] {
  return [...shell.args, line];
}

/**
 * The message for a shell that could not be STARTED.
 *
 * Shared so the wording is identical wherever it happens: a reader who meets it in a
 * check and again in a plan's acceptance should recognise it as one condition, not
 * two unrelated faults.
 */
export function shellStartFailure(who: string, shell: IShell, spawnError: string): string {
  return (
    `${who}: could not start the shell '${shell.command}' (${spawnError}). ` +
    `The command was never run — set the shell to one this machine has: ` +
    `\`shell: { command: 'sh', args: ['-c'] }\` on the check, or the SPECWARDEN_SHELL environment variable for every check.`
  );
}
