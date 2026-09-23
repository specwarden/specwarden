import { type ILine, total } from './checkout.ts';

/** A partial refund: the chosen lines' amount, tax included. */
export const refund = (lines: readonly ILine[]): number => total(lines);
