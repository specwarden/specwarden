/** Split an amount in minor units into `parts` shares that sum back to it exactly. */
export function allocate(amount: number, parts: number): number[] {
  const base = Math.floor(amount / parts);
  const remainder = amount - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
