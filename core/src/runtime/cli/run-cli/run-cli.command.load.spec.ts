import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ICliIo } from '../../../index';
import { KNOWN_FLAGS } from '../_shared/parse-args/parse-args.util';
import { USAGE, main } from './run-cli.command';

function captureIo(): { io: ICliIo; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return { io: { out: (t) => (out += t), err: (t) => (err += t) }, out: () => out, err: () => err };
}

/**
 * Exit 2 means the line, the config or the roster could not be used — and 1 means a gate
 * failed, nothing else. Every case here used to be reported as something it was not: help
 * as an error, a typo'd flag as a run, a config that does not parse as a failed gate with
 * a node stack.
 */
describe('the line', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-line-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each([[['--help']], [['-h']], [['help']], [['check', '--help']]])(
    '%j prints the usage to stdout and exits 0 — it was an error on stderr, exit 2',
    async (argv) => {
      const cap = captureIo();
      expect(await main(argv, {}, dir, cap.io)).toBe(0);
      expect([cap.out(), cap.err()]).toEqual([USAGE, '']);
    },
  );

  it('an unknown flag exits 2 by name, before anything runs', async () => {
    const cap = captureIo();
    expect(await main(['check', '--tighen', '--fixx'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toBe(`unknown flag --tighen; unknown flag --fixx.\n\n${USAGE}`);
    expect(cap.out()).toBe('');
  });

  it('a value flag with no value exits 2 by name — `--id` at the end ran every check', async () => {
    const cap = captureIo();
    expect(await main(['check', '--id'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('--id needs a value.');
  });

  it("`--verify` is plan's own flag, so the grammar does not refuse it there", async () => {
    const cap = captureIo();
    expect(await main(['plan', 'status', 'nope.md', '--verify'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toBe('no such plan: nope.md.\n');
  });

  // Read and ignored: `init --tier heavy`, `doctor --fix` and `check --template x` each ran
  // as if the flag were not on the line.
  it.each([
    [['init', '--tier', 'heavy'], '--tier is a flag of check, not of init'],
    [['doctor', '--fix'], '--fix is a flag of check, not of doctor'],
    [['check', '--template', 'x'], '--template is a flag of init, not of check'],
    [['adopt', '--json'], '--json is a flag of check and doctor, not of adopt'],
    [['check', '--verify'], '--verify is a flag of plan, not of check'],
  ])('%j is refused, naming the command that owns the flag', async (argv, said) => {
    const cap = captureIo();
    expect(await main(argv, {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toBe(`${said}.\n\n${USAGE}`);
    expect(cap.out()).toBe('');
  });

  it('takes --flag=value as the flag and its value', async () => {
    const cap = captureIo();
    expect(await main(['check', '--tier=', '--all=yes'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toBe(`--tier needs a value; --all takes no value, and was given "yes".\n\n${USAGE}`);
  });

  it('refuses --json beside a --reporter that says otherwise — --json IS --reporter json', async () => {
    const cap = captureIo();
    expect(await main(['check', '--json', '--reporter', 'tty'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain('--json is --reporter json, and --reporter tty says otherwise.');
  });

  it('an unknown command is named above the usage', async () => {
    const cap = captureIo();
    expect(await main(['bogus'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toBe(`unknown command "bogus".\n\n${USAGE}`);
  });

  it('an unknown command close to a known one says which', async () => {
    const cap = captureIo();
    expect(await main(['chek'], {}, dir, cap.io)).toBe(2);
    expect(cap.err()).toContain(`unknown command "chek" (did you mean 'check'?).`);
  });

  it('no command at all is the usage alone, on stderr, exit 2', async () => {
    const cap = captureIo();
    expect(await main([], {}, dir, cap.io)).toBe(2);
    expect([cap.out(), cap.err()]).toEqual(['', USAGE]);
  });

  it('the usage names every flag the grammar knows', () => {
    for (const flag of KNOWN_FLAGS) expect(USAGE, flag).toContain(flag);
  });

  // Read from the sources rather than listed here: a variable the engine starts reading
  // and the usage never mentions is a behaviour nobody can find without the code.
  it('the usage names every environment variable the engine reads, and the exit codes', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const read = new Set<string>();
    const walk = (at: string): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const path = join(at, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.')) {
          for (const m of readFileSync(path, 'utf8').matchAll(/\benv\.(CI|GITHUB_ACTIONS|SPECWARDEN_[A-Z_]+)\b/g)) {
            read.add(m[1]);
          }
        }
      }
    };
    walk(src);

    expect([...read].sort()).toEqual(expect.arrayContaining(['CI', 'GITHUB_ACTIONS', 'SPECWARDEN_SKIP']));
    for (const name of read) expect(USAGE, name).toContain(name);
    expect(USAGE).toContain('SPECWARDEN_SHELL');
    for (const code of [
      '0 every check held',
      '1 the answer is no: a check failed, doctor found a defect, a plan is not ready',
      '2 the line',
    ])
      expect(USAGE).toContain(code);
    // Nothing the command line prints about a run calls one check a gate.
    expect(USAGE).not.toMatch(/\bgates?\b/);
    expect(USAGE).toContain('spw is the same command');
  });
});

describe('the config and the roster, as load errors', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-load-'));
    mkdirSync(join(dir, '.specwarden', 'checks'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const config = (body: string) => writeFileSync(join(dir, '.specwarden', 'config.mjs'), body);
  const checkFile = (rel: string, body: string) => writeFileSync(join(dir, '.specwarden', 'checks', rel), body);
  const built = (fields: string) =>
    `{ id: 'x', title: 'x', tier: 'fast', zone: 'consumer', capabilities: [], contractVersion: 1, when: () => true, run: () => ({ ok: true, findings: [] }), ${fields} }`;
  const load = async (argv = ['check', '--all']) => {
    const cap = captureIo();
    return { code: await main(argv, {}, dir, cap.io), out: cap.out(), err: cap.err() };
  };

  it('a config that does not parse: exit 2, the file named — it was exit 1 and a node stack', async () => {
    config('export default {\n');
    const r = await load();
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^\.specwarden\/config\.mjs failed to load: /);
    expect(r.err).not.toMatch(/\n\s+at /);
  });

  it('a config importing a package that is not installed: exit 2, the file named', async () => {
    config("import 'not-installed-anywhere';\nexport default {};\n");
    const r = await load(['doctor']);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^\.specwarden\/config\.mjs failed to load: .*not-installed-anywhere/);
  });

  it('a check naming a tier outside the vocabulary: exit 2, the check, its file and the tiers', async () => {
    config("export default { tiers: ['fast', 'heavy'] };");
    checkFile('x.check.mjs', `export const check = ${built('').replace("tier: 'fast'", "tier: 'fastt'")};\n`);
    const r = await load();
    expect(r.code).toBe(2);
    expect(r.err).toBe(
      'check \'x\' (.specwarden/checks/x.check.mjs) declares tier "fastt" — expected one of: fast, heavy. ' +
        'A tier outside the vocabulary is no tier a run can select, so no `--tier` would ever run it.\n',
    );
  });

  it('a check the config built with no id: exit 2, and the way to name it', async () => {
    config(`export default { checks: [${built('').replace("id: 'x'", "id: '<unnamed>'")}] };`);
    const r = await load();
    expect(r.code).toBe(2);
    expect(r.err).toContain('a check with no `id` was registered');
  });

  it('a check on another contract: exit 2 with the reason', async () => {
    config(`export default { checks: [${built('').replace('contractVersion: 1', 'contractVersion: 9')}] };`);
    const r = await load();
    expect([r.code, r.err]).toEqual([2, expect.stringContaining("check 'x' was built against check-contract v9")]);
  });

  it('two checks with one id in the config: exit 2 with the reason', async () => {
    config(`export default { checks: [${built('')}, ${built('')}] };`);
    const dup = await load();
    expect([dup.code, dup.err]).toEqual([
      2,
      "two checks declare id 'x'. Ids are the runner's address for a check; they must be unique.\n",
    ]);
  });

  it('a hand-written object in a check file: exit 2, the file named, not "contract vundefined"', async () => {
    config('export default {};');
    checkFile(
      'lit.check.mjs',
      "export const check = { id: 'lit', title: 't', tier: 'fast', run: () => ({ ok: true, findings: [] }) };\n",
    );
    const r = await load();
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^\.specwarden\/checks\/lit\.check\.mjs: 'lit' is a hand-written object, not a built check/);
  });

  it('a repository whose tiers leave out `fast` gets its harness in its first tier, not refused', async () => {
    config("export default { tiers: ['pre-commit', 'pr'], rules: [] };");
    const r = await load(['doctor']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^ratchet-direction\tpre-commit\t/m);
  });
});
