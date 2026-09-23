import { type ICheck, type IFinding, type IVerdict, buildCheck, checkOptions } from 'specwarden';
import type { IOpsCheckIdentity } from '../_shared/identity/identity.model';
import { stripHeredocs } from 'specwarden';

/**
 * `local` used outside a function — a runtime abort no syntax check can see.
 *
 * THE DEFECT. A script gains a `local` inside a `BASH_SOURCE` main block, which is not a
 * function. bash answers `local: can only be used in a function`, that is a FAILING
 * command, and a script running under `set -Eeuo pipefail` aborts on that line. Put that in
 * a restore drill and the drill dies mid-run, and the next scheduled one reports a failure
 * whose cause is four words in a log nobody reads until something needs restoring.
 *
 * WHY A SYNTAX CHECK DOES NOT CATCH IT. `bash -n` passes. `local` is a builtin, not a
 * keyword, so whether it is legal where it stands is only knowable at execution — the check
 * that exists reports success about something it cannot see.
 *
 * HOW THE SCOPE IS DECIDED, and the honest limit of it. A function opens `<indent>name() {`
 * and closes with `}` at the SAME indent; a `local` outside every such span is outside every
 * function. That is a heuristic about a widely-held convention rather than a bash parser,
 * and it is the deliberate trade: a real parser is a project.
 *
 * Three shapes took wrong versions to get right, and each is a case in the spec:
 *   - a ONE-LINE definition (`f() { x; }`) opens and closes on the same line, so pushing it
 *     leaves the enclosing function's `}` matching the one-liner instead;
 *   - a NESTED definition closes first, so the spans are a stack, not one open marker;
 *   - indentation, not column zero: functions defined inside a main block are indented, and
 *     reading them as top-level reported their `local`s as violations.
 *
 * NOT CHECKED, so nobody believes it is: the `function name {` form, and a heredoc body
 * that happens to contain the word — bodies are stripped first, because a commit message
 * quoting a rule is not a violation of it.
 */

export interface IShellLocalScopeOptions extends IOpsCheckIdentity {
  /** Which shell files are the subject, as git pathspecs over tracked files. A vendored
   * script is not the host's to style. Default: every tracked `.sh`, `**\/*.sh`. */
  readonly pathspecs?: readonly string[];
}

/** `[start, end]` line indices (0-based, inclusive) of every function body. */
export function functionSpans(lines: readonly string[]): [number, number][] {
  const spans: [number, number][] = [];
  const stack: { start: number; indent: number }[] = [];

  lines.forEach((line, i) => {
    const opener = /^(\s*)[A-Za-z_][\w:.-]*\s*\(\)\s*\{/.exec(line);
    if (opener) {
      if (line.includes('}')) return; // a one-line definition opens and closes here
      stack.push({ start: i, indent: (opener[1] as string).length });
      return;
    }
    const closer = /^(\s*)\}/.exec(line);
    if (!closer || stack.length === 0) return;
    const top = stack[stack.length - 1] as { start: number; indent: number };
    if ((closer[1] as string).length === top.indent) {
      spans.push([top.start, i]);
      stack.pop();
    }
  });

  return spans;
}

/** Lines where `local` is used with no enclosing function. */
export function localOutsideFunction(text: string): { line: number; text: string }[] {
  // `keepLineCount`, because this check REPORTS a line number: dropping a heredoc body
  // shifts every line below it and points the reader at the wrong statement.
  const lines = stripHeredocs(text, { keepLineCount: true }).split('\n');
  const spans = functionSpans(lines);
  const inside = (i: number): boolean => spans.some(([a, b]) => i >= a && i <= b);

  const hits: { line: number; text: string }[] = [];
  lines.forEach((line, i) => {
    if (!/^\s*local\s+\S/.test(line)) return;
    if (inside(i)) return;
    hits.push({ line: i + 1, text: line.trim() });
  });
  return hits;
}

export function shellLocalScope(options: IShellLocalScopeOptions): ICheck {
  checkOptions('shellLocalScope', options, { pathspecs: { kind: 'array' } });
  const pathspecs = options.pathspecs ?? ['**/*.sh'];

  return buildCheck(
    {
      ...options,
      rule: options.rule ?? {
        statement: 'a shell script uses `local` only inside a function',
        owner: '@specwarden/ops',
        implied: true,
      },
      tier: options.tier ?? 'fast',
      zone: 'product',
    },
    ['read'],
    (ctx): IVerdict => {
      const files = [...new Set(pathspecs.flatMap((spec) => [...ctx.vcs.trackedFiles(spec)]))];

      // A ZERO-FILE SCAN IS A FAILURE, not a clean run. Checks that walked a tree that was
      // not there have reported success in this codebase before; saying so costs one branch.
      if (files.length === 0) {
        return {
          ok: false,
          findings: [
            {
              severity: 'error',
              message: `no shell files matched ${pathspecs.join(', ')} — this check examined nothing`,
              ruleId: options.id,
            },
          ],
        };
      }

      const findings: IFinding[] = [];
      for (const file of files) {
        const source = ctx.files.tryRead(file);
        if (source === undefined) continue;
        for (const hit of localOutsideFunction(source)) {
          findings.push({
            severity: 'error',
            file,
            message: `${file}:${hit.line}  ${hit.text}`,
            ruleId: options.id,
          });
        }
      }

      return findings.length > 0
        ? { ok: false, findings }
        : {
            ok: true,
            findings: [{ severity: 'info', message: `✓ ${files.length} shell file(s), 0 misplaced \`local\`` }],
          };
    },
  );
}
