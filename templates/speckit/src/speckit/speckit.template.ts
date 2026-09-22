import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import { compose, docPathsPart, scriptWrappersPart, secretScanPart, specSourcePart } from 'specwarden-scaffold-parts';

/**
 * A starting tree for a repository that specifies its work with SPEC KIT.
 *
 * WHAT THIS TEMPLATE IS ACTUALLY FOR. Spec Kit owns the specification — `specs/<feature>/`
 * holds the requirements (`**FR-001**: the system MUST …`) and the task list. SpecWarden
 * does not restate any of it: two tools owning one fact is how a specification and its
 * enforcement drift apart. What it adds is the SEAM — the spec source, so
 * `specwarden sync-invariants` reconciles those requirements against the invariants this
 * repository has deposited in its own documents, and names both gaps: a requirement with
 * no invariant, and an invariant whose requirement has vanished.
 *
 * Nothing is written by that command. A requirement's wording was written for approval;
 * turning it into an invariant read as truth about behaviour is a person's decision.
 *
 * Beside the seam: the credential scan, documentation paths, and the linter and suite
 * the manifest already declares — the acceptance a feature's tasks are checked off
 * against, run in the same tier as everything else.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(
    specSourcePart('speckit'),
    secretScanPart(ctx),
    docPathsPart(ctx, {
      header: `every repository-relative path named in documentation resolves.
 *
 * Including the paths inside \`specs/\`: a feature's plan citing a file that has moved is
 * read as current by whoever implements the feature next.`,
    }),
    scriptWrappersPart(ctx),
  );

export const speckitTemplate: ITemplate = {
  name: 'speckit',
  describe: 'a repository specified with Spec Kit — the spec source wired, credential scan, doc paths, lint and tests',
  requires: ['specwarden-module-speckit', 'specwarden-module-security', 'specwarden-module-docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => assembled(ctx).files,
  rules: (ctx: ITemplateContext): readonly IRule[] => assembled(ctx).rules,
  configExtras: (ctx: ITemplateContext) => assembled(ctx).configExtras ?? { fields: '' },
};
