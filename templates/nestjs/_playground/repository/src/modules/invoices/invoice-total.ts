export interface IInvoiceLine {
  readonly quantity: number;
  /** Minor units — cents — so a total is an integer and never a float that drifts. */
  readonly unitPrice: number;
  /** Percent, e.g. 20 for 20%. */
  readonly taxRate: number;
}

/** The invoice total in minor units, tax included, each line rounded half-up. */
export function invoiceTotal(lines: readonly IInvoiceLine[]): number {
  return lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPrice * (1 + l.taxRate / 100)), 0);
}
