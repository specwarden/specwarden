export interface ILine {
  readonly price: number;
  readonly taxRate: number;
}

/** The total a customer is shown: every line, tax included, in minor units. */
export function total(lines: readonly ILine[]): number {
  const sum = lines.reduce((s, l) => s + Math.round(l.price * (1 + l.taxRate / 100)), 0);
  if (sum === 0) throw new Error('refused: a basket whose total is zero');
  return sum;
}
