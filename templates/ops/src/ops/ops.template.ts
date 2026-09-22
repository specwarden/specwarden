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
 * which of them run the proxy on the host, where the application declares its keys — so
 * they ship as `.example` with the one thing to fill in named at the top. Guessed, each
 * would be wrong in half the repositories that installed it, and a check that fails a
 * correct tree teaches a team to skip the gate.
 *
 * The doc-path check earns its place here for a specific reason: an operational document
 * is read under pressure, and a path in a runbook that no longer resolves costs minutes
 * exactly when there are none.
 */
const assembled = (ctx: ITemplateContext) =>
  compose(
    secretScanPart(ctx, {
      header: `a credential-shaped string anywhere in the tracked tree.
 *
 * An infrastructure repository is where connection strings, tokens and signing keys are
 * most likely to arrive by accident — pasted into a compose file "just to test". A match
 * means ROTATE first, delete second: the history keeps what the diff removes.`,
    }),
    shellScopePart(ctx, { pathspecs: ['scripts/**/*.sh', 'deploy/**/*.sh', '*.sh'] }),
    envFilesExamplePart(ctx),
    upstreamsExamplePart(ctx),
    docPathsPart(ctx, {
      header: `every repository-relative path named in documentation resolves.
 *
 * An operational document is read under pressure. A path in a runbook that no longer
 * resolves costs minutes exactly when there are none, and the reader — already halfway
 * through an incident — has to guess what it became.`,
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
