import { describe, expect, it } from 'vitest';

import { DEFAULT_SHELL, resolveShell, shellArgv, shellFlag, shellStartFailure } from './shell.model';

/**
 * Which shell a command runs through when the check names none. The case that matters is
 * Windows: a bare `bash` there is often WSL's launcher, so a command check ran inside
 * Linux — where the Windows `node` does not exist — and failed for a reason that had
 * nothing to do with the repository, while the same run from Git Bash passed.
 */
const GIT = 'C:\\Program Files\\Git';
const has =
  (...present: string[]) =>
  (path: string) =>
    present.includes(path);

describe('resolveShell', () => {
  it('is bash -c everywhere but Windows, whatever the environment says', () => {
    const shell = resolveShell(
      { platform: 'linux', env: { SPECWARDEN_SHELL: 'zsh', PATH: `${GIT}\\cmd` } },
      () => true,
    );

    expect(shell).toEqual(DEFAULT_SHELL);
  });

  it('on Windows, prefers the shell the house named in SPECWARDEN_SHELL, with the flag its name implies', () => {
    const env = { platform: 'win32', env: { SPECWARDEN_SHELL: 'pwsh' } };

    expect(resolveShell(env, () => false)).toEqual({ command: 'pwsh', args: ['-Command'] });
    expect(resolveShell({ ...env, env: { SPECWARDEN_SHELL: 'C:\\tools\\cmd.exe' } }, () => false)).toEqual({
      command: 'C:\\tools\\cmd.exe',
      args: ['/c'],
    });
    expect(resolveShell({ ...env, env: { SPECWARDEN_SHELL: 'D:\\bin\\bash.exe' } }, () => false)).toEqual({
      command: 'D:\\bin\\bash.exe',
      args: ['-c'],
    });
  });

  it("on Windows, finds Git's own bash beside the git on the PATH — not the bash in System32", () => {
    const env = {
      platform: 'win32',
      env: { Path: `C:\\Windows\\System32;${GIT}\\cmd;C:\\nvm4w\\nodejs` },
    };
    // System32 has a bash.exe too (WSL's); only Git's is asked about, and only Git's is taken.
    const shell = resolveShell(env, has(`${GIT}\\bin\\bash.exe`, 'C:\\Windows\\System32\\bash.exe'));

    expect(shell).toEqual({ command: `${GIT}\\bin\\bash.exe`, args: ['-c'] });
  });

  it('reads `Git\\bin` and `Git\\usr\\bin` PATH entries as the same install, and a per-user install too', () => {
    const perUser = 'C:\\Users\\me\\AppData\\Local\\Programs\\Git';

    expect(
      resolveShell({ platform: 'win32', env: { PATH: `${GIT}\\usr\\bin` } }, has(`${GIT}\\bin\\bash.exe`)),
    ).toEqual({
      command: `${GIT}\\bin\\bash.exe`,
      args: ['-c'],
    });
    expect(
      resolveShell(
        { platform: 'win32', env: { PATH: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' } },
        has(`${perUser}\\bin\\bash.exe`),
      ),
    ).toEqual({ command: `${perUser}\\bin\\bash.exe`, args: ['-c'] });
  });

  it('falls back to the usual install directories when git is not on the PATH', () => {
    const shell = resolveShell(
      { platform: 'win32', env: { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' } },
      has('C:\\Program Files (x86)\\Git\\bin\\bash.exe'),
    );

    expect(shell).toEqual({ command: 'C:\\Program Files (x86)\\Git\\bin\\bash.exe', args: ['-c'] });
  });

  it('falls back to a bare bash -c when no Git bash exists anywhere it looks', () => {
    expect(resolveShell({ platform: 'win32', env: { PATH: `${GIT}\\cmd` } }, () => false)).toEqual(DEFAULT_SHELL);
  });
});

describe('the shell helpers', () => {
  it('derives the command flag from the executable name, ignoring its directory and extension', () => {
    expect(shellFlag('/usr/bin/zsh')).toEqual(['-c']);
    expect(shellFlag('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toEqual(['-Command']);
    expect(shellFlag('powershell')).toEqual(['-Command']);
    expect(shellFlag('CMD.EXE')).toEqual(['/c']);
  });

  it('puts the command line after the shell’s own arguments', () => {
    expect(shellArgv({ command: 'sh', args: ['-e', '-c'] }, 'echo hi')).toEqual(['-e', '-c', 'echo hi']);
  });

  it('tells a reader how to set a shell this machine has — per check, or for every check', () => {
    const message = shellStartFailure('lint', DEFAULT_SHELL, 'ENOENT');

    expect(message).toContain("could not start the shell 'bash' (ENOENT)");
    expect(message).toContain('SPECWARDEN_SHELL');
    expect(message).toContain("shell: { command: 'sh', args: ['-c'] }");
  });
});
