/** The ports — the interfaces the engine depends on and the infrastructure
 * implements. A port lives in `domain/`; its adapter lives in `infrastructure/`. */
export { FileNotFoundError } from './file-source/file-source.port';
export type { IFileSource } from './file-source/file-source.port';
export type { IFileWriter } from './file-writer/file-writer.port';
export type { IVcs } from './vcs/vcs.port';
export type { IProcessOptions, IProcessResult, IProcessRunner } from './process-runner/process-runner.port';
export type { IClock } from './clock/clock.port';
export type { IReporter, IRunSummary } from './reporter/reporter.port';
export type { IRatchetStore } from './ratchet-store/ratchet-store.port';
export type { IAgentRuntime } from './agent-runtime/agent-runtime.port';
