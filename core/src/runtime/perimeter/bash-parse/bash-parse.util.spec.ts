import { describe, expect, it } from 'vitest';

import { commandWords, parseCommand, segments, stripHeredocs, tokens } from './bash-parse.util';

/**
 * The parsing half of the perimeter. `perimeter.spec.ts` pins the disguises end to
 * end; this pins the edges of each step on its own — the ones where a parser that is
 * wrong in the UNSAFE direction lets a command through unexamined.
 */
describe('stripHeredocs', () => {
  const command = 'git commit -F - <<EOF\nnever run: git push --force\nEOF\ngit status';

  it('drops a heredoc body and resumes after its terminator', () => {
    expect(stripHeredocs(command)).toBe('git commit -F - <<EOF\ngit status');
  });

  /**
   * A caller that reports a LINE needs the body replaced, not removed: dropping it
   * shifts every line below, and the number printed points at the wrong statement.
   */
  it('keeps the line count when asked, blanking the body instead of removing it', () => {
    const kept = stripHeredocs(command, { keepLineCount: true });

    expect(kept).toBe('git commit -F - <<EOF\n\n\ngit status');
    expect(kept.split('\n')).toHaveLength(command.split('\n').length);
    expect(kept.split('\n')[3]).toBe('git status');
  });

  it.each([
    ["cat <<'END'\nbody\nEND\nafter", 'a single-quoted terminator'],
    ['cat <<"END"\nbody\nEND\nafter', 'a double-quoted terminator'],
    ['cat <<-END\n\tbody\n\tEND\nafter', 'the tab-stripping form with an indented terminator'],
  ])('recognises %j (%s)', (input) => {
    expect(stripHeredocs(input)).toBe(`${input.split('\n')[0]}\nafter`);
  });

  it('leaves a command with no heredoc exactly as it was', () => {
    expect(stripHeredocs('a && b\nc')).toBe('a && b\nc');
  });
});

describe('segments', () => {
  it('splits on every separator a shell runs separately', () => {
    expect(segments('a && b || c ; d | e & f\ng')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('drops the empty segments a trailing or doubled separator leaves', () => {
    expect(segments('a ;; b ;')).toEqual(['a', 'b']);
    expect(segments('')).toEqual([]);
  });
});

describe('tokens', () => {
  it('removes exactly one layer of surrounding quotes', () => {
    expect(tokens(`git commit -m "a message" '-v'`)).toEqual(['git', 'commit', '-m', 'a message', '-v']);
    expect(tokens(`echo "'inner'"`)).toEqual(['echo', "'inner'"]);
  });

  it('keeps a quote that is only part of a token', () => {
    expect(tokens('--name="x"')).toEqual(['--name="x"']);
  });

  it('answers no tokens for blank input rather than failing on a null match', () => {
    expect(tokens('')).toEqual([]);
    expect(tokens('   ')).toEqual([]);
  });
});

describe('commandWords', () => {
  it('skips every leading environment assignment', () => {
    expect(commandWords(['A=1', 'B_2=x', 'docker', 'run'])).toEqual(['docker', 'run']);
  });

  it('keeps an assignment-shaped ARGUMENT after the first real word', () => {
    expect(commandWords(['env', 'A=1', 'docker'])).toEqual(['env', 'A=1', 'docker']);
  });

  it('is empty when the segment was nothing but assignments', () => {
    expect(commandWords(['A=1'])).toEqual([]);
  });
});

describe('parseCommand', () => {
  it('drops a segment that held only assignments, so a rule never sees an empty word list', () => {
    expect(parseCommand('A=1; git push')).toEqual([['git', 'push']]);
  });
});
