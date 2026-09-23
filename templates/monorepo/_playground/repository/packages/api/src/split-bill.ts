import { allocate } from '@acme/money';

/** A bill split between diners, in minor units. */
export const splitBill = (total: number, diners: number): number[] => allocate(total, diners);
