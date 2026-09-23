/** 1234 → "12.34" — the api speaks minor units, a person reads major ones. */
export const format = (minor: number): string => (minor / 100).toFixed(2);
