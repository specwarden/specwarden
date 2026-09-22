/**
 * Shell command parsing — the part of the perimeter that is CODE, not data. It
 * expresses what a table cannot: stripping heredoc bodies, cutting a chain into the
 * segments a shell runs separately, tokenizing with one layer of quotes removed,
 * and separating environment assignments from the first real word. It is universal
 * (no repository or stack knowledge), so it lives in the product; the rules that
 * use it are the repository's.
 *
 * The whole reason this is generated-against rather than example-tested: both false
 * positives in the runtime it was extracted from were ONE command in different
 * clothing. A parser is what turns a wardrobe of disguises back into the command.
 */

/**
 * Strip heredoc BODIES before anything else looks at the command. A body is data on
 * stdin, not a command — a commit message explaining a forbidden rule is not a
 * violation of it. The opening LINE is kept, because the redirection itself can be
 * the violation (`cat <<EOF > protected/file`).
 *
 * A HERESTRING (`<<<`) IS NOT A HEREDOC, and conflating them opens a hole rather
 * than closing one: `read -r a b <<< "${payload}"` matched the opener, `${payload}`
 * became the terminator, no later line ever equalled it, and every remaining line
 * was discarded as body — so a forbidden command written BELOW a herestring was not
 * examined at all. The lookarounds are what keep `<<<` out; both neighbours matter,
 * because the alternative anchors would still match the last two of three `<`.
 */
export interface IStripHeredocsOptions {
  /**
   * Replace each stripped body line with an empty one instead of dropping it.
   *
   * A caller that REPORTS a line number needs this: dropping the body shifts every line
   * below it, so the number it prints points a reader at the wrong statement. A caller that
   * only asks "is this command forbidden" does not care and pays nothing either way. One
   * implementation with a flag, rather than two that drift — the second copy of this
   * function existed for about an hour, and the compiler is what refused it.
   */
  readonly keepLineCount?: boolean;
}

export function stripHeredocs(command: string, options: IStripHeredocsOptions = {}): string {
  const out: string[] = [];
  let terminator: string | null = null;
  for (const line of command.split('\n')) {
    if (terminator !== null) {
      if (line.trim() === terminator) terminator = null;
      if (options.keepLineCount === true) out.push('');
      continue;
    }
    out.push(line);
    const open = /(?<!<)<<(?!<)-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][\w-]*))/.exec(line);
    if (open) terminator = open[1] ?? open[2] ?? open[3];
  }
  return out.join('\n');
}

/**
 * Split into the segments a shell would run separately, so the second half of
 * `cd x && <forbidden>` is examined on its own. Deliberately naive about quoting:
 * over-splitting can only ever make the perimeter look at MORE segments, never
 * fewer — the safe direction.
 *
 * The single `&` (run the left command in the background, then continue) is a
 * separator too, and dropping it was under-splitting — the unsafe direction: a
 * forbidden command after `& ` (`echo ok & git push origin prod`) stayed glued to a
 * benign first word, so a rule keyed on the first word never saw it. `&&` is matched
 * by its own alternative first, so adding `&` to the class only catches the lone one.
 */
export function segments(command: string): string[] {
  return stripHeredocs(command)
    .split(/\|\||&&|[;\n|&]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Tokenize a segment, stripping one layer of surrounding quotes from each token. */
export function tokens(segment: string): string[] {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) =>
    /^(".*"|'.*')$/s.test(t) ? t.slice(1, -1) : t,
  );
}

/** The words after any leading environment assignments (`MODE=prod docker …` → `docker …`). */
export function commandWords(tks: readonly string[]): string[] {
  let i = 0;
  while (i < tks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tks[i])) i++;
  return tks.slice(i);
}

/** The full pipeline: a raw command to the list of word-arrays a perimeter rule sees. */
export function parseCommand(command: string): string[][] {
  return segments(command)
    .map((segment) => commandWords(tokens(segment)))
    .filter((words) => words.length > 0);
}
