import { ALLOW, type IActionIntent, type IPerimeterRule, type IPerimeterVerdict } from '../../../domain';
import { parseCommand } from '../bash-parse/bash-parse.util';

interface IRuleMeta {
  readonly id: string;
  /** The document that owns the rule — named in the block so the reader complies
   * rather than disabling the hook. */
  readonly owner?: string;
  readonly why?: string;
}

export interface ICommandRuleSpec extends IRuleMeta {
  /** Return the hit string when the parsed words of a segment violate the rule,
   * else null. Words have had env-assignments and one quote layer removed. */
  readonly match: (words: readonly string[]) => string | null;
}

export interface IWriteRuleSpec extends IRuleMeta {
  /** Return the hit when a written path violates the rule, else null. */
  readonly match: (filePath: string) => string | null;
}

function reason(meta: IRuleMeta, hit: string): string {
  return (
    `${hit}` +
    (meta.owner ? ` — rule ${meta.id}, owner ${meta.owner}` : ` — rule ${meta.id}`) +
    (meta.why ? `. ${meta.why}` : '')
  );
}

/** A perimeter rule over a shell command: the engine parses the command and offers
 * each segment's words to `match`. This is where a repository's command rules —
 * a protected branch, a skipped hook — are declared as data. */
export function commandRule(spec: ICommandRuleSpec): IPerimeterRule {
  return {
    id: spec.id,
    evaluate(intent: IActionIntent): IPerimeterVerdict {
      // Semantics, not a vendor's tool name: whatever the assistant calls its shell,
      // the runtime adapter has already told us this action runs a command.
      if (typeof intent.command !== 'string') return ALLOW;
      const command = intent.command;
      for (const words of parseCommand(command)) {
        const hit = spec.match(words);
        if (hit) return { blocked: true, ruleId: spec.id, reason: reason(spec, hit) };
      }
      return ALLOW;
    },
  };
}

/** A perimeter rule over a file write — a generated file nobody may hand-edit,
 * say — expressed against the file-editing tools rather than a shell redirection. */
export function writeRule(spec: IWriteRuleSpec): IPerimeterRule {
  return {
    id: spec.id,
    evaluate(intent: IActionIntent): IPerimeterVerdict {
      if (typeof intent.writePath !== 'string') return ALLOW;
      const hit = spec.match(intent.writePath);
      return hit ? { blocked: true, ruleId: spec.id, reason: reason(spec, hit) } : ALLOW;
    },
  };
}
