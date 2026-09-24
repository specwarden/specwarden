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

/**
 * A refusal as the CLI prints it: one sentence, ending with a period, then a newline.
 *
 * Refusals were written one by one, and read that way — some closed, some trailed off after
 * a list, some ended on a dash. A script matching the line, and a person reading it, meet one
 * shape now, whatever produced the message.
 */
export function refusal(message: string): string {
  const text = message.trimEnd();
  return /[.]$/.test(text) ? `${text}\n` : `${text}.\n`;
}
