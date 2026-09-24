import type { ICheck } from '../check/check.model';

/**
 * A plugin — a package that contributes DECLARATIONS: checks, and (as those gain
 * contracts) rules, perimeter policies, presets, instruments, reporters. It declares
 * WHAT to check; the engine owns HOW.
 *
 * The boundary is load-bearing: a plugin NEVER supplies a port adapter. The file
 * system, git, process spawning are the engine's, and a plugin that swapped
 * `IFileSource` would bypass both the isolation and the capability manifest. The
 * type has no slot for an adapter, and the loader refuses one at runtime too.
 */
export interface IPlugin {
  readonly name: string;
  readonly checks?: readonly ICheck[];
}

/** A plugin is usually a factory taking options — `nestjs({ modulesDir })`. */
export type TPluginFactory<O> = (options: O) => IPlugin;
