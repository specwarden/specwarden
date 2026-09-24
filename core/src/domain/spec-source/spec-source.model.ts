import type { IFileSource } from '../ports/file-source/file-source.port';

/**
 * A spec source — where requirements and tasks come from, when a spec-driven tool
 * (OpenSpec, Spec Kit, Kiro) sits on top. specwarden answers a different question
 * than those tools ("does the decided thing still hold", not "what to build"), so
 * it shares the work with them rather than replacing them — and the sharing is
 * declared through this port, not assumed.
 *
 * The load-bearing detail: a source distinguishes "I did not find what I expected"
 * from "there is nothing here". An empty list is indistinguishable from "no tasks",
 * which is once again a check that cannot fail — so every result carries `found`.
 */
export interface ISpecRequirement {
  /** Stable identifier — the SAME id the requirement had upstream, so an invariant
   * pinned to it can be traced back to the requirement it proves. */
  readonly id: string;
  /** The requirement, in whatever notation the source uses (EARS, a WHEN/THEN
   * scenario). The adapter does not translate it — it attaches proof later. */
  readonly statement: string;
}

export interface ISpecTask {
  readonly id: string;
  readonly title: string;
  /** The acceptance command — the proof a task is done, wherever the task lives. */
  readonly acceptance?: string;
  readonly done?: boolean;
}

/** A result that separates "found nothing" from "did not find the source at all". */
export interface ISpecSourceResult<T> {
  readonly found: boolean;
  readonly items: readonly T[];
  /** What was looked for and not found, when `found` is false. */
  readonly note?: string;
}

export interface ISpecSource {
  readonly name: string;
  requirements(files: IFileSource): ISpecSourceResult<ISpecRequirement>;
  tasks(files: IFileSource): ISpecSourceResult<ISpecTask>;
}
