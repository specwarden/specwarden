/**
 * The CLI's only way to speak.
 *
 * Injected rather than reached for, so a command is testable without capturing
 * global streams — and because the engine bans `console` everywhere but the
 * reporter, which is the one place output is the product rather than a side effect.
 */
export interface ICliIo {
  out(text: string): void;
  err(text: string): void;
}

export const defaultIo: ICliIo = {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
};
