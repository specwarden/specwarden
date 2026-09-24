/**
 * A starting tree for an INFRASTRUCTURE repository.
 *
 * Every failure this kind of repository has is discovered in production, by an operator,
 * at the worst hour — a key missing from one mode's env file, a proxy upstream that
 * resolves to the proxy itself, `local` at the top level of a deploy script. All three
 * are invisible in review and decidable from the files.
 */
export { opsTemplate } from './ops/ops.template';
