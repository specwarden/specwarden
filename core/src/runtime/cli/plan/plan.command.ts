import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { ARCHIVE_HEADER_FIELDS, archiveReadiness, shellArgv } from '../../../domain';
import type { IProcessResult, IProcessRunner, IShell } from '../../../domain';
import { ChildProcessRunner, NodeFileSource, platformShell } from '../../../infrastructure';
import { parsePlan } from '../../planner/plan-parser/plan-parser.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/**
 * `specwarden plan status <file> [--verify]`. Without `--verify` it lists the
 * phases and the acceptance command each declares. With `--verify` it RUNS each
 * acceptance command and prints the actual state — because a checkmark is an
 * assertion and a passed acceptance command is proof. Verification is behind a flag
 * on purpose: acceptance can be heavy, and a command that is slow to run is a
 * command people start to avoid, after which it protects nothing.
 */
export async function planStatus(
  argv: readonly string[],
  cwd: string,
  io: ICliIo,
  proc: IProcessRunner = new ChildProcessRunner(),
): Promise<number> {
  const sub = argv[1];
  if (sub !== 'status' && sub !== 'archive') {
    io.err('usage: specwarden plan <status|archive> <file> [--verify]\n');
    return 2;
  }
  const file = argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) {
    io.err(`usage: specwarden plan ${sub} <file>${sub === 'status' ? ' [--verify]' : ''}\n`);
    return 2;
  }
  const abs = resolve(cwd, file);
  if (!existsSync(abs)) {
    io.err(`no such plan: ${file}\n`);
    return 2;
  }

  // `plan archive` is the harvest GATE: it refuses (exit 2) until the plan declares
  // what moved and where, every destination resolves, and the archive header is there
  // (`**Started:**`, `**Finished:**`, `**Branch:**`, `**Harvested:**`, `**Left open:**`).
  // It never moves the file itself — the operator does that with `git mv` once this
  // reports ready, so the move stays a reviewable commit and needs no delete/rename
  // capability here.
  if (sub === 'archive') {
    const readiness = archiveReadiness(readFileSync(abs, 'utf8'), new NodeFileSource(cwd));
    if (readiness.ready) {
      io.out(
        `✅ ${file} is ready to archive — harvest declared, every destination resolves, and the header carries ` +
          `${ARCHIVE_HEADER_FIELDS.map((f) => `**${f}:**`).join(', ')}.\n   Move it: git mv ${file} ${dirname(file)}-archive/\n`,
      );
      return 0;
    }
    io.err(`❌ ${file} is not ready to archive:\n`);
    for (const reason of readiness.reasons) io.err(`   • ${reason}\n`);
    return 2;
  }

  const { plan, findings, declared } = parsePlan(readFileSync(abs, 'utf8'));
  const verify = argv.includes('--verify');

  // The DECLARED status — an undeclared one printed as "draft", beside the finding that
  // said there was none.
  io.out(`plan: ${file}  (status ${declared ?? 'undeclared'}${plan.branch ? `, branch ${plan.branch}` : ''})\n\n`);
  for (const finding of findings) io.out(`  ⚠ ${finding.message}\n`);
  if (findings.length) io.out('\n');

  if (!verify) {
    for (const phase of plan.phases) {
      io.out(`  • ${phase.title} — ${phase.acceptance ?? '(no acceptance)'}\n`);
    }
    return findings.some((f) => f.severity === 'error') ? 1 : 0;
  }

  // `--verify` over a plan with nothing to run verified nothing, and said so with exit 0.
  // That is the reading this whole product exists against: "every acceptance passed" over
  // zero acceptances. A plan with no runnable acceptance is refused as unverifiable.
  if (!plan.phases.some((phase) => phase.acceptance !== undefined)) {
    io.out('  ❌ no phase declares an acceptance command — there is nothing to verify\n');
    return 1;
  }

  let failed = findings.filter((f) => f.severity === 'error').length;
  for (const phase of plan.phases) {
    if (phase.acceptance === undefined) continue;
    const shell: IShell = platformShell();
    const result = proc.run(shell.command, shellArgv(shell, phase.acceptance), { cwd });
    const ok = result.status === 0;
    io.out(`  ${ok ? '✅' : '❌'} ${phase.title} — ${phase.acceptance}\n`);
    if (!ok) {
      failed++;
      // A red acceptance says WHY. It printed one line and nothing else, so the reader
      // re-ran the command by hand to learn what the verification had already seen.
      io.out(outputOf(result));
    }
  }
  return failed > 0 ? 1 : 0;
}

/** The last lines a failing acceptance printed, indented under its phase — or what the
 * process said about itself when it printed nothing. */
const TAIL = 40;
function outputOf(result: IProcessResult): string {
  const text = `${result.stdout}${result.stderr}`.replace(/\s+$/, '');
  const lines = text === '' ? [] : text.split(/\r?\n/);
  const shown = lines.slice(-TAIL);
  const head = lines.length > TAIL ? [`… ${lines.length - TAIL} earlier line(s)`] : [];
  const said =
    shown.length > 0
      ? [...head, ...shown]
      : [
          result.spawnError !== undefined
            ? `the shell did not start: ${result.spawnError}`
            : `exit ${result.status ?? 'by signal'}, and no output`,
        ];
  return said.map((line) => `      ${line}\n`).join('');
}
