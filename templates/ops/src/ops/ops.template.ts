import type { IRule, ITemplate, ITemplateContext, ITemplateFile } from 'specwarden';
import {
  ciCoveragePart,
  compose,
  docPathsPart,
  envFilesExamplePart,
  secretScanPart,
  shellScopePart,
  upstreamsExamplePart,
} from '@specwarden/scaffold-parts';

/**
 * A starting tree for an INFRASTRUCTURE repository — compose files, a reverse proxy,
 * deploy and backup scripts, the runbook beside them.
 *
 * WHAT MAKES THIS KIND DIFFERENT. Every failure here is discovered in production, by an
 * operator, at the worst hour. A key missing from one mode's env file starts the service
 * anyway and degrades it; a proxy pointing at `localhost` from inside a container
 * resolves to itself and returns a 502 naming no service; `local` at the top level of a
 * script is a runtime error that, under `set -e`, ends a deploy halfway. None of the
 * three is visible in review, and all three are decidable from the files.
 *
 * WHAT IT SHIPS LIVE, and what it cannot. The credential scan needs nothing but the tree,
 * and the shell-scope check needs only that there BE tracked shell — where there is none
 * it is omitted, since a check reporting that it examined nothing fails, correctly, and a
 * scaffold must not be the reason a first run is red.
 *
 * The env-file and upstream checks need a fact about YOUR deployment — which modes exist,
 * which of them run the proxy on the host, which service verifies a key — so they ship as
 * `.example`, pointed at the compose file, proxy config and workflow `init` found.
 *
 * The doc-path check reads every tracked document: the README is where an operator starts
 * ("when something is on fire, start at …"), and a runbook path that no longer resolves
 * costs minutes exactly when there are none.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(
    secretScanPart(ctx, {
      header:
        'Connection strings and tokens arrive here by accident, pasted into a compose file "just to test".\nA match means rotate first, delete second: the history keeps what the diff removes.',
    }),
    shellScopePart(ctx, { pathspecs: ['scripts/**/*.sh', 'deploy/**/*.sh', '*.sh'] }),
    envFilesExamplePart(ctx),
    upstreamsExamplePart(ctx),
    docPathsPart(ctx, {
      header:
        'A runbook is read under pressure; a path in it that no longer resolves costs minutes when there are none.',
      docs: '**/*.md',
    }),
    ciCoveragePart(ctx),
  );

export const ops: ITemplate = {
  name: 'ops',
  describe: 'an infrastructure repository — credential scan, shell scoping, env files, proxy upstreams, runbook paths',
  // All three unconditionally. The ops module is required even where the shell check is
  // omitted, because the two examples import it as well — a repository that fills one in
  // must not then discover it has to install something.
  requires: ['@specwarden/security', '@specwarden/docs', '@specwarden/ops'],

  files: (ctx: ITemplateContext): readonly ITemplateFile[] => assembled(ctx).files,
  rules: (ctx: ITemplateContext): readonly IRule[] => assembled(ctx).rules,
};
