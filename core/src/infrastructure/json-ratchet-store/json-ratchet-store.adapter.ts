import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { type IRatchet, type IRatchetStore, type TRatchetDirection, tightenedTo } from '../../domain';

/** Thrown when `establish` is called on an id that already has a baseline — a
 * baseline is set once, and moving it the loose way is exactly what the ratchet
 * forbids. */
export class RatchetOverwriteError extends Error {
  override readonly name = 'RatchetOverwriteError';
  constructor(readonly ratchetId: string) {
    super(`ratchet '${ratchetId}' already has a baseline; establish() will not overwrite it. Use tighten() to move it towards its target.`);
  }
}

/**
 * A ratchet persisted as one JSON file per id (measured ~6 edits in 8 days, so a
 * shared file would conflict constantly). The one-way invariant lives here and is
 * pinned by the store's test: `tighten` only ever moves towards the target,
 * `establish` refuses to overwrite. No public operation loosens a stored value.
 *
 * WHICH WAY IS FORWARD is the caller's declaration. `down` (a debt count, lower is
 * better) stays the default, so nothing that existed before this changes behaviour.
 *
 * EVERY OTHER KEY IN THE FILE SURVIVES A WRITE. A ratchet file is read by people as
 * often as by the engine, and the ones that mean anything carry a `note` saying what
 * the number measures and what would let it move. This used to serialise `{ id,
 * value }` and nothing else, so the first `--tighten` silently deleted that sentence
 * — the number survived and the only record of what it meant did not.
 */
export class JsonRatchetStore implements IRatchetStore {
  constructor(private readonly fileForId: (id: string) => string) {}

  read(id: string): IRatchet | undefined {
    const record = this.readRecord(id);
    if (record === undefined) return undefined;
    return { id, value: record.value as number };
  }

  establish(id: string, value: number): IRatchet {
    if (this.read(id) !== undefined) throw new RatchetOverwriteError(id);
    return this.persist(id, value);
  }

  tighten(id: string, value: number, direction: TRatchetDirection = 'down'): IRatchet {
    const current = this.read(id);
    if (current === undefined) return this.persist(id, value);
    const next = tightenedTo(current.value, value, direction);
    return next === current.value ? current : this.persist(id, next);
  }

  /** The whole stored object, or `undefined` when the file is absent. Kept apart from
   * `read` so `persist` can carry the keys this store does not own. */
  private readRecord(id: string): Record<string, unknown> | undefined {
    const file = this.fileForId(id);
    if (!existsSync(file)) return undefined;
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  }

  private persist(id: string, value: number): IRatchet {
    const file = this.fileForId(id);
    // `id` and `value` lead, so the two keys the engine owns stay at the top of a
    // file a person opens; everything the consumer added keeps its own order after.
    const existing = this.readRecord(id) ?? {};
    const { id: _id, value: _value, ...rest } = existing;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ id, value, ...rest }, null, 2)}\n`);
    return { id, value };
  }
}
