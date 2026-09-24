import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where a consumer declaration may sit: flat in the zone root, or in its own folder.
 *
 * The engine scaffolds `.specwarden/perimeter.mjs` flat and resolved only that, which made the
 * flat root a contract rather than a default — a consumer whose own style is
 * FOLDER-PER-UNIT (a file that has a test lives in a folder together with it, instead of
 * sitting flat beside the next unit's test) had to choose between its own convention and a
 * working CLI. Accepting both layouts costs one `existsSync` and keeps the choice on the
 * consumer's side, which is where a layout belongs; nothing here learns any repository.
 *
 * THE FOLDER IS NAMED FOR THE FILE'S STEM — everything before the first dot. That is the same
 * derivation folder-per-unit uses everywhere else (`perimeter.mjs` -> `perimeter/`,
 * `config.mjs` -> `config/`, `dependency-pins.check.mjs` -> `dependency-pins/`): the
 * dotted tail is a CONCERN, not part of the unit's name, so two concerns of one unit share
 * one folder rather than inventing two.
 *
 * Order matters and the flat form wins. A consumer mid-migration may hold both for a moment,
 * and the file the engine scaffolded is the one it must keep reading until that file is gone.
 */
export function declarationCandidates(dir: string, file: string): readonly string[] {
  const firstDot = file.indexOf('.');
  const stem = firstDot === -1 ? file : file.slice(0, firstDot);
  // A stem equal to the file name would name a folder after the file itself; there is no
  // second candidate to offer in that case.
  return stem === file ? [join(dir, file)] : [join(dir, file), join(dir, stem, file)];
}

/** The first candidate that exists, or `undefined` when the declaration is absent. */
export function resolveDeclaration(dir: string, file: string): string | undefined {
  return declarationCandidates(dir, file).find((candidate) => existsSync(candidate));
}
