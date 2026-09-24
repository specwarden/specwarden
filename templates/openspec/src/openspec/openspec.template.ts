import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import { compose, docPathsPart, scriptWrappersPart, secretScanPart, specSourcePart } from '@specwarden/scaffold-parts';

/**
 * A starting tree for a repository that specifies its work with OPENSPEC.
 *
 * WHAT THIS TEMPLATE IS ACTUALLY FOR. OpenSpec already owns the specification: what
 * must be true, which change proposes it, which tasks remain. specwarden does not
 * duplicate any of that and must not — two tools owning one fact is how a
 * specification and its enforcement drift apart in the first place. What it adds is the
 * SEAM: the spec source, so `specwarden sync-invariants` can reconcile the requirements
 * OpenSpec holds against the invariants deposited in this repository's own documents.
 *
 * The reconciliation prints and writes nothing. Turning a requirement's wording — which
 * was written for approval — into a module invariant read as truth about behaviour is a
 * person's decision, every time.
 *
 * Beside the seam, what any code repository of this kind benefits from: the credential
 * scan, documentation paths, and the linter and suite the manifest already declares —
 * the same three the Spec Kit template wires, since a repository specified in either tool
 * is otherwise an ordinary codebase. Deliberately no plan checks — a repository using
 * OpenSpec plans in OpenSpec, and a second lifecycle would compete with the first.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(
    specSourcePart('openspec'),
    secretScanPart(ctx),
    docPathsPart(ctx, {
      header: 'A change proposal citing a file that has moved is read as current by whoever picks it up next.',
    }),
    scriptWrappersPart(ctx),
  );

export const openspecTemplate: ITemplate = {
  name: 'openspec',
  describe: 'A repository specified with OpenSpec — the spec source wired, credential scan, doc paths, lint and tests.',
  requires: ['@specwarden/openspec', '@specwarden/security', '@specwarden/docs'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => assembled(ctx).files,
  rules: (ctx: ITemplateContext): readonly IRule[] => assembled(ctx).rules,
  configExtras: (ctx: ITemplateContext) => assembled(ctx).configExtras ?? { fields: '' },
};
