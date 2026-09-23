/** The adapters — one per port, plus the in-memory file source that lets the
 * engine be exercised against a differently-shaped repository. A port lives in
 * `domain/`; its adapter lives here. */
export { NodeFileSource } from './node-file-source/node-file-source.adapter';
export { NodeFileWriter } from './node-file-writer/node-file-writer.adapter';
export { InMemoryFileSource } from './in-memory-file-source/in-memory-file-source.adapter';
export { ChildProcessRunner } from './child-process-runner/child-process-runner.adapter';
export { GitVcs } from './git-vcs/git-vcs.adapter';
export { SystemClock } from './system-clock/system-clock.adapter';
export { TtyReporter } from './tty-reporter/tty-reporter.adapter';
export type { ITtyReporterOptions } from './tty-reporter/tty-reporter.adapter';
export { JsonReporter } from './json-reporter/json-reporter.adapter';
export { GithubReporter } from './github-reporter/github-reporter.adapter';
export { JsonRatchetStore, RatchetOverwriteError } from './json-ratchet-store/json-ratchet-store.adapter';
export { type TWriteSink, stdoutSink } from './reporter-sink/reporter-sink.model';
export {
  parseClaudeToolCall,
  perimeterExitCode,
  formatBlock,
  claudeAgentRuntime,
} from './agent-runtime/claude/claude.adapter';
export { forgetPlatformShell, platformShell } from './platform-shell/platform-shell.adapter';
