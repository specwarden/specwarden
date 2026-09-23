const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** The reason a link was refused, or `undefined` when it may sign somebody in. */
export function refusal(issuedAt: number, used: boolean, now: number): string | undefined {
  if (used) return 'this link has already been used';
  if (now - issuedAt > FIFTEEN_MINUTES) return 'this link is older than fifteen minutes';
  return undefined;
}
