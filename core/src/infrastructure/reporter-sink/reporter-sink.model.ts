/** Where a reporter writes. Injected so a test can capture output and the default
 * is the process's stdout — the reporter is the engine's single console writer. */
export type TWriteSink = (text: string) => void;

export const stdoutSink: TWriteSink = (text) => {
  process.stdout.write(text);
};
