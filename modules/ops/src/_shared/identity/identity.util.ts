import type { ICheckDeclaration, IFinding, IModuleCheckDeclaration, TOptionSpec } from 'specwarden';

/** The package every implied rule here is owned by. */
export const OPS_OWNER = '@specwarden/ops';

/**
 * The options every ops check takes beside its own: how many units a run must examine —
 * and `zone` refused, because a module's check speaks for the module.
 *
 * `corpus` was missing from all five, and `ratchet` was accepted and dropped: a consumer who
 * wrote `ratchet: 3` had every finding fail the run, and a corpus that came back empty was
 * refused in five different sentences, none of them the engine's.
 */
export const MODULE_OPTIONS: TOptionSpec = {
  corpus: { kind: 'object' },
  zone: { refused: "a module's check speaks for its module, so its zone is `product`" },
};

/**
 * The identity an ops check is built with: the consumer's declaration, its id defaulting
 * to the factory's name in kebab case, its rule defaulting to the one the package implies,
 * and the zone the package's own.
 *
 * The id defaults here rather than from the file name because a module's check is named
 * for its subject, and every document names it that way: a check wired inside a config,
 * a preset or a file exporting several had no file name to borrow and was refused unnamed.
 */
export function opsIdentity(options: IModuleCheckDeclaration, id: string, statement: string): ICheckDeclaration {
  return {
    ...options,
    id: options.id ?? id,
    rule: options.rule ?? { statement, owner: OPS_OWNER, implied: true },
    zone: 'product',
  };
}

/** An error finding: every one here is about a file, and names the line when it is known. */
export function failure(message: string, file: string, line?: number): IFinding {
  return { severity: 'error', message, file, ...(line === undefined ? {} : { line }) };
}

/** An info finding. */
export const note = (message: string): IFinding => ({ severity: 'info', message });

/** The 1-based line of the first line `test` accepts, or undefined. */
export function lineWhere(source: string, test: (line: string) => boolean): number | undefined {
  const index = source.split('\n').findIndex((line) => test(line.replace(/\r$/, '')));
  return index === -1 ? undefined : index + 1;
}
