import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import { compose, docPathsPart, secretScanPart, specSourcePart } from 'specwarden-scaffold-parts';

/**
 * A starting tree for a repository that specifies its work with OPENSPEC.
 *
 * WHAT THIS TEMPLATE IS ACTUALLY FOR. OpenSpec already owns the specification: what
 * must be true, which change proposes it, which tasks remain. SpecWarden does not
 * duplicate any of that and must not — two tools owning one fact is how a
 * specification and its enforcement drift apart in the first place. What it adds is the
 * SEAM: the spec source, so `specwarden sync-invariants` can reconcile the requirements
 * OpenSpec holds against the invariants deposited in this repository's own documents.
 *
 * The reconciliation prints and writes nothing. Turning a requirement's wording — which
 * was written for approval — into a module invariant read as truth about behaviour is a
 * person's decision, every time.
 *
 * Beside the seam, the two checks any repository benefits from: the credential scan, and
 * documentation paths. Deliberately no plan checks — a repository using OpenSpec plans
 * in OpenSpec, and a second lifecycle would compete with the first.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(
    specSourcePart('openspec'),
    secretScanPart(ctx),
    docPathsPart(ctx, {
      header: `every repository-relative path named in documentation resolves.
 *
 * Including the paths inside \`openspec/\`: a change proposal that cites a file which
 * has moved is read as current by whoever picks the change up next.`,
    }),
  );

export const openspecTemplate: ITemplate = {
  name: 'openspec',
  describe: 'a repository specified with OpenSpec — the spec source wired, credential scan, doc paths',
  requires: ['specwarden-module-openspec', 'specwarden-module-security', 'specwarden-module-docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => assembled(ctx).files,
  rules: (ctx: ITemplateContext): readonly IRule[] => assembled(ctx).rules,
  configExtras: (ctx: ITemplateContext) => assembled(ctx).configExtras ?? { fields: '' },
};
