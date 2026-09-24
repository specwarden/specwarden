import type { IRule, ITemplateFile } from 'specwarden';

/**
 * A PART — the file or files a template writes for one decision, and the rule they enforce.
 *
 * The reusable piece a template is assembled from, so a template is a LIST OF DECISIONS:
 * which parts a repository of its kind wants on day one, and what to say about each. Most
 * parts write one check; a lifecycle of several checks that only make sense together
 * (`planLifecyclePart`) or a repository's own scripts wrapped one file per script
 * (`scriptWrappersPart`) write more than one. A part emits strings nothing typechecks,
 * which is why one copy of each lives here.
 *
 * WHERE THE RULE GOES. A live check declares its own rule (`rule: '…'`), owned by the
 * check file, so the check and the rule cannot drift apart. `rules` holds only what the
 * register must: a rule whose enforcers are not checks (the perimeter's), and the rule
 * of an `.example`. `init` writes an example's rule COMMENTED OUT in `rules.mjs`, beside
 * the others: live, it would name a check nobody registered and fail
 * `enforcement-resolves` on the tree just written; absent, the repository's statement of
 * the rule lives nowhere it can read. An example therefore names its `id` where a live
 * check leaves it to the file name: the rule names the check by it, and the pair must stay
 * linked whatever the renamed file ends up called.
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
   * The sentence saying why the check earns its place HERE, replacing the default.
   *
   * A dead documentation path is an inconvenience in a library and a wrong action taken
   * confidently in a repository agents work in; the generated file is where that reason
   * has to be, because it is the file somebody reads when deciding whether to delete it.
   */
  readonly header?: string;
}
