import type { IRule } from '../../domain';

export interface IConstraintCardOptions {
  /** Heading for the generated card. */
  readonly title?: string;
  /** The card's length budget in bytes. A card that must be re-injected after every
   * compaction and read in full cannot grow without bound; over-budget is a defect
   * OF THE GENERATOR's inputs, surfaced here rather than discovered in a session. */
  readonly maxBytes?: number;
  /** The most lines the card may carry. Past this it is a document, and a document
   * is exactly what compaction drops — which is the one thing the card exists not to
   * be. Over-limit is fixed by taking a rule OFF the card, never by raising this. */
  readonly maxLines?: number;
  /** A note placed under the heading, for the reader of the file rather than the
   * agent reading the card. Emitted as an HTML comment, which the injector strips. */
  readonly note?: string;
}

export class ConstraintCardTooLongError extends Error {
  override readonly name = 'ConstraintCardTooLongError';
  constructor(
    readonly bytes: number,
    readonly maxBytes: number,
  ) {
    super(`the generated constraint card is ${bytes} bytes, over the ${maxBytes}-byte budget. Tighten a constraint's wording, or raise the budget deliberately.`);
  }
}

export class ConstraintCardTooManyLinesError extends Error {
  override readonly name = 'ConstraintCardTooManyLinesError';
  constructor(
    readonly lines: number,
    readonly maxLines: number,
  ) {
    super(
      `the generated constraint card has ${lines} constraints, over the limit of ${maxLines}. ` +
        'Take a rule off the card — unmark it irreversible — rather than raising the limit: a card ' +
        'long enough to be a document is a card compaction drops, which protects nothing.',
    );
  }
}

/**
 * Thrown when a rule is marked irreversible and gives no card line.
 *
 * REFUSING IS THE POINT. The card's readers are not the register's readers, and the two
 * wordings differ on purpose — declarative for an auditor, imperative for whoever is about
 * to act. Falling back to `statement` would emit a line that reads as a description of the
 * world, in the one place where the difference decides what somebody does next; and the
 * consumers of this card enforce a shape ("every line is a prohibition") that a declarative
 * statement fails anyway. A loud refusal at generation beats a card that silently degrades.
 */
export class ConstraintCardMissingLineError extends Error {
  override readonly name = 'ConstraintCardMissingLineError';
  constructor(readonly ruleIds: readonly string[]) {
    super(
      `${ruleIds.join(', ')}: marked irreversible with no \`card\` line. A rule on the constraint ` +
        'card needs its own imperative wording — the card is read mid-task by whoever is about to ' +
        'act, and a declarative statement reads there as a description rather than an instruction.',
    );
  }
}

/**
 * Generate the constraint card from the rule registry — the rules marked
 * `irreversible`.
 *
 * WHAT THIS ENDS. The same prohibitions live in three places: the rule register, the
 * enforcement that implements them (a perimeter rule, a check), and the card that is
 * re-injected into every session. Three registers of one fact, and only the first two
 * had anything reconciling them. Measured in the first consumer on 2026-09-22, they had
 * drifted in BOTH directions: the register marked seven rules irreversible while the
 * card carried thirteen, two register rules never reached the card at all — one of them
 * the prohibition on destroying a volume by subcommand, added because it could name the
 * database volume directly — and four card lines had no rule behind them anywhere.
 *
 * The card is the one of the three that is read while acting. It is also the only one
 * nothing was generating.
 *
 * Deterministic: rules are emitted in registry order, so regenerating an unchanged
 * registry produces a byte-identical card (a regenerable check depends on this).
 */
export function generateConstraintCard(rules: readonly IRule[], options: IConstraintCardOptions = {}): string {
  const title = options.title ?? 'Irreversible constraints — re-injected after every compaction';
  const irreversible = rules.filter((r) => r.irreversible);

  const missing = irreversible.filter((r) => r.card === undefined || r.card.trim() === '').map((r) => r.id);
  if (missing.length > 0) throw new ConstraintCardMissingLineError(missing);

  if (options.maxLines !== undefined && irreversible.length > options.maxLines) {
    throw new ConstraintCardTooManyLinesError(irreversible.length, options.maxLines);
  }

  const note = options.note === undefined ? '' : `\n<!--\n${options.note.trim()}\n-->\n`;
  const body = irreversible.map((r) => `- ${(r.card as string).trim()}`).join('\n');
  const card = `# ${title}\n${note}\n${body}\n`;

  if (options.maxBytes !== undefined) {
    const bytes = new TextEncoder().encode(card).length;
    if (bytes > options.maxBytes) throw new ConstraintCardTooLongError(bytes, options.maxBytes);
  }
  return card;
}
