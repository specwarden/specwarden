/**
 * The CLI surface.
 *
 * One folder per command, each holding whatever only that command needs — `adopt`
 * keeps `detect-repo`, `suggest` keeps `infer-sibling` — so a helper's blast radius
 * is visible from the tree rather than discovered by grep. `_shared/` holds the three
 * things every command genuinely shares: how it speaks, how argv is read, and how the
 * config is found.
 */
export { main } from './run-cli/run-cli.command';
export type { ICliIo } from './_shared/cli-io/cli-io.model';
export { findConfig } from './_shared/find-config/find-config.util';
export { parseArgs } from './_shared/parse-args/parse-args.util';
export { evaluatePayload } from './perimeter/perimeter.command';
export { newCheck } from './new-check/new-check.command';
