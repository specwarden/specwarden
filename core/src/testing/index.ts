/**
 * The testing kit — part of the product, not a fixture folder someone forgot to
 * delete.
 *
 * A check is the one kind of code whose failure mode is silence, so the engine's
 * whole design is aimed at making a check runnable against a world a test describes
 * rather than the machine it happens to be on. Publishing the ports and keeping the
 * means of exercising them private only half-delivered that: measured in the first
 * consumer, not one of 23 check tests used the engine, and all of them hand-rolled a
 * partial fake that breaks as soon as the check reads a second port.
 */
export { MissingTestPortError, errorsOf, runCheck, testContext } from './test-context/test-context.util';
export type { ITestContext, ITestContextOptions } from './test-context/test-context.util';
