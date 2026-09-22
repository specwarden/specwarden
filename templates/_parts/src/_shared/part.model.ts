import type { IRule, ITemplateFile } from 'specwarden';

/**
 * A PART — one check, the file that configures it, and the rule it enforces.
 *
 * WHY THIS EXISTS. A template emits files, and five templates emitted the same
 * credential scan four times, the same doc-path check five times, and the same pair of
 * script wrappers twice. Copy-paste in generated prose is worse than copy-paste in
 * code: nothing typechecks it, and the day a module option is renamed, four of the five
 * copies get fixed and the fifth writes a tree that throws on its first run.
 *
 * So the reusable piece is a part, and a template is a LIST OF DECISIONS again — which
 * parts a repository of this kind wants on day one, and what to say about each. The
 * prose stays overridable per template, because "why this check matters here" is
 * genuinely different in a handbook and in a backend.
 *
 * A part carries its RULE with it. A check registered without a rule is an orphan, and
 * `orphan-check` fails the tier for one — so a shared emitter that wrote the file and
 * left the rule to the caller would hand every template the same trap.
 *
 * AN `.example` PART DECLARES NO RULE. Its file is not loaded until someone renames it,
 * and a rule naming a check nobody registered fails `enforcement-resolves` on a tree
 * the scaffold just wrote — the harness reporting its own scaffold as a defect.
 */
export interface IPart {
  readonly files: readonly ITemplateFile[];
  readonly rules: readonly IRule[];
  /**
   * Extra config source, for a part whose tree needs the config to know something about
   * it — the perimeter is the case that forced it.
   */
  readonly configExtras?: { readonly imports?: string; readonly fields: string };
}

/** Options every part accepts: the prose is the template's to phrase. */
export interface IPartOptions {
  /**
   * The first paragraph of the generated file's header, replacing the default.
   *
   * Not decoration. The reason a check earns its place is different per repository —
   * a dead documentation path is an inconvenience in a library and a wrong action taken
   * confidently in a repository agents work in — and the generated file is where that
   * reason has to be, because it is the file somebody reads six months later.
   */
  readonly header?: string;
}
