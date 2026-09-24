import { ALLOW, type IActionIntent, type IPerimeterPolicy, type IPerimeterVerdict } from '../../../domain';
import { parseCommand } from '../bash-parse/bash-parse.util';

interface IPolicyMeta {
  readonly id: string;
  /** The document that owns the policy — named in the block so the reader complies
   * rather than disabling the hook. */
  readonly owner?: string;
  /** What to do instead, printed with the block. */
  readonly why?: string;
}

export interface ICommandPolicyOptions extends IPolicyMeta {
  /** Return the hit string when the parsed words of a segment violate the policy,
   * else null. Words have had env-assignments and one quote layer removed. */
  readonly match: (words: readonly string[]) => string | null;
}

export interface IWritePolicyOptions extends IPolicyMeta {
  /** Return the hit when a written path violates the policy, else null. */
  readonly match: (filePath: string) => string | null;
}

function reason(meta: IPolicyMeta, hit: string): string {
  return (
    `${hit}` +
    (meta.owner ? ` — policy ${meta.id}, owner ${meta.owner}` : ` — policy ${meta.id}`) +
    (meta.why ? `. ${meta.why}` : '')
  );
}

/** A perimeter policy over a shell command: the engine parses the command and offers
 * each segment's words to `match`. This is where a repository's command policies —
 * a protected branch, a skipped hook — are declared as data. */
export function commandPolicy(options: ICommandPolicyOptions): IPerimeterPolicy {
  return {
    id: options.id,
    evaluate(intent: IActionIntent): IPerimeterVerdict {
      // Semantics, not a vendor's tool name: whatever the assistant calls its shell,
      // the runtime adapter has already told us this action runs a command.
      if (typeof intent.command !== 'string') return ALLOW;
      const command = intent.command;
      for (const words of parseCommand(command)) {
        const hit = options.match(words);
        if (hit) return { blocked: true, policyId: options.id, reason: reason(options, hit) };
      }
      return ALLOW;
    },
  };
}

/** A perimeter policy over a file write — a generated file nobody may hand-edit,
 * say — expressed against the file-editing tools rather than a shell redirection. */
export function writePolicy(options: IWritePolicyOptions): IPerimeterPolicy {
  return {
    id: options.id,
    evaluate(intent: IActionIntent): IPerimeterVerdict {
      if (typeof intent.writePath !== 'string') return ALLOW;
      const hit = options.match(intent.writePath);
      return hit ? { blocked: true, policyId: options.id, reason: reason(options, hit) } : ALLOW;
    },
  };
}
