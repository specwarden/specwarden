/**
 * A starting tree for a repository whose product IS documentation.
 *
 * Smaller than the code templates on purpose: no symbol check (there is no code for
 * symbols to resolve against), and the count check ships as an `.example` because its
 * vocabulary is English and a documentation repository is the likeliest place for that
 * to be false — a check that finds nothing reports green, which looks exactly like
 * clean documentation.
 */
export { docsOnly } from './docs-only/docs-only.template';
