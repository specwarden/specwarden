import {
  type ICheck,
  type ICorpusFloor,
  type IFinding,
  type IModuleCheckDeclaration,
  type IVerdict,
  type TPathspecs,
  belowCorpusFloor,
  buildCheck,
  checkOptions,
  stripHeredocs,
  thresholdOf,
  verdictFrom,
  withExaminedNote,
} from 'specwarden';
import { MODULE_OPTIONS, failure, opsIdentity } from '../_shared/identity/identity.util';

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

export interface IShellScopeOptions extends IModuleCheckDeclaration {
  /** The shell scripts that are the subject, as git pathspecs over tracked files — one, or a
   * list whose matches are joined. Default: every tracked `.sh`, `**\/*.sh`. */
  readonly scripts?: TPathspecs;
  /** Pathspecs left out — a vendored script is not the consumer's to style. */
  readonly except?: readonly string[];
  /** How many scripts a run must read. Default: at least 1. */
  readonly corpus?: ICorpusFloor;
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

export function shellScope(options: IShellScopeOptions = {}): ICheck {
  checkOptions('shellScope', options, {
    ...MODULE_OPTIONS,
    scripts: { kind: ['string', 'array'], nonEmpty: true },
    except: { kind: 'array' },
  });
  const scripts = options.scripts ?? '**/*.sh';
  const pathspecs = typeof scripts === 'string' ? [scripts] : scripts;
  const except = options.except ?? [];

  return buildCheck(
    opsIdentity(options, 'shell-scope', 'a shell script uses `local` only inside a function'),
    ['read'],
    (ctx, self): IVerdict => {
      const exempt = new Set(except.flatMap((spec) => [...ctx.vcs.trackedFiles(spec)]));
      const files = [...new Set(pathspecs.flatMap((spec) => [...ctx.vcs.trackedFiles(spec)]))]
        .filter((file) => !exempt.has(file))
        .sort()
        .flatMap((file) => {
          const source = ctx.files.tryRead(file);
          return source === undefined ? [] : [{ file, source }];
        });

      const floor = belowCorpusFloor(
        self.id,
        files.length,
        options.corpus,
        `${pathspecs.map((p) => `\`${p}\``).join(', ')} matched no tracked script${except.length > 0 ? ' outside `except`' : ''}`,
        'shell file',
      );
      if (floor) return floor;

      const findings: IFinding[] = [];
      for (const { file, source } of files) {
        for (const hit of localOutsideFunction(source)) {
          findings.push(
            failure(
              `${file}:${hit.line} \`${hit.text}\` is outside every function — bash refuses it at run time. ` +
                'Move it inside a function, or drop `local`.',
              file,
              hit.line,
            ),
          );
        }
      }

      return verdictFrom(withExaminedNote(findings, self.id, files.length, 'shell file'), thresholdOf(ctx, self));
    },
  );
}
