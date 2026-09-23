import { CheckOptionsError, type ICheckIdentity, type TTier } from 'specwarden';

/**
 * The identity a documentation check takes: the engine's, with `tier` optional.
 *
 * Every check in this package only reads files, so `fast` is the one tier any of them
 * belongs in, and a consumer who has to say so five times is writing the same word five
 * times. Absent, it is `fast`.
 */
export interface IDocCheckIdentity extends Omit<ICheckIdentity, 'tier' | 'title'> {
  /** Absent: the rule's statement — every check here names the rule it enforces. */
  readonly title?: string;
  readonly tier?: TTier;
}

/**
 * A configuration error the option-kind check cannot see — a list that is present but
 * empty — named the way `checkOptions` names one: the factory, the check, the option.
 */
export function optionsError(factory: string, id: string | undefined, message: string): CheckOptionsError {
  return new CheckOptionsError(`${factory}${id ? ` '${id}'` : ''}: ${message}`);
}
