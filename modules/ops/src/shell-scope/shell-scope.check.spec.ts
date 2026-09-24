import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck, stripHeredocs } from 'specwarden';
import { functionSpans, localOutsideFunction, shellScope } from './shell-scope.check';

/**
 * Every case is a shape a line-based scan gets wrong — the main block that is not a
 * function, the nested block that is, the heredoc body that must not fire the rule and
 * must not shift the line number.
 */
describe('localOutsideFunction', () => {
  it('finds a local inside a BASH_SOURCE main block, which is not a function', () => {
    const script = [
      '#!/usr/bin/env bash',
      'set -Eeuo pipefail',
      '',
      'if [ "${BASH_SOURCE[0]}" = "$0" ]; then',
      '  local pg_image',
      '  pg_image="$(read_the_tag)"',
      'fi',
    ].join('\n');

    const [hit] = localOutsideFunction(script);

    expect(hit?.line).toBe(5);
    expect(hit?.text).toMatch(/local pg_image/);
  });

  it('allows a local inside a function', () => {
    expect(localOutsideFunction(['do_thing() {', '  local x', '  x=1', '}'].join('\n'))).toEqual([]);
  });

  it('finds the one local outside several functions', () => {
    const script = ['first() {', '  local a', '}', '', 'second() {', '  local b', '}', '', 'local c'].join('\n');

    const hits = localOutsideFunction(script);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(9);
  });

  it('allows a local inside a nested block inside a function', () => {
    const script = ['do_thing() {', '  if [ -n "$1" ]; then', '    local inner', '    inner=1', '  fi', '}'].join('\n');

    expect(localOutsideFunction(script)).toEqual([]);
  });

  it('treats a heredoc body as data, and keeps the reported line true', () => {
    const script = ['write_note() {', "  cat > /tmp/x <<'EOF'", 'local this is prose', 'EOF', '}', 'local real'].join(
      '\n',
    );

    const hits = localOutsideFunction(script);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(6);
  });

  /**
   * The three parsing shapes that took wrong versions to get right. Each one, once, made
   * the scan read a whole file as top-level and report every `local` in it.
   */
  it('does not push a one-line definition — its brace is not the enclosing function closing', () => {
    const script = ['outer() {', '  _add_ok() { echo ok; }', '  local fine', '}'].join('\n');

    expect(localOutsideFunction(script)).toEqual([]);
  });

  it('closes a nested definition before the one that contains it', () => {
    const script = ['outer() {', '  inner() {', '    local a', '  }', '  local b', '}', 'local top'].join('\n');

    const hits = localOutsideFunction(script);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(7);
  });

  it('reads an indented definition as a function, not as top level', () => {
    const script = ['main() {', '  _cleanup() {', '    local x', '  }', '  _cleanup', '}'].join('\n');

    expect(localOutsideFunction(script)).toEqual([]);
  });

  it('is not blinded by a herestring — a `local` below one is still examined', () => {
    const script = ['read -r a b <<< "${payload}"', 'local top'].join('\n');

    expect(localOutsideFunction(script)).toHaveLength(1);
  });
});

describe('functionSpans / stripHeredocs', () => {
  it('finds the spans of the name() { form', () => {
    const lines = ['a() {', '  x', '}', 'noise', 'b() {', '  y', '}'];

    expect(functionSpans(lines)).toEqual([
      [0, 2],
      [4, 6],
    ]);
  });

  it('keeps the line count under `keepLineCount`, so a reported number is usable', () => {
    const text = ["cat <<'EOF'", 'a', 'b', 'EOF', 'after'].join('\n');

    expect(stripHeredocs(text, { keepLineCount: true }).split('\n')).toHaveLength(text.split('\n').length);
    // Without it the body is dropped, which is what the perimeter wants and what would
    // point this check's line numbers at the wrong statement.
    expect(stripHeredocs(text).split('\n').length).toBeLessThan(text.split('\n').length);
  });
});

describe('functionSpans — the closing brace', () => {
  it('ignores a brace at another indent — only the one level with the opener closes it', () => {
    // An `if` body's closing `}` inside a function is not the function ending; closing on
    // it would read the rest of the function as top level and report every `local` in it.
    const lines = ['f() {', '  { grouped; ', '  }', '  local x', '}'];

    expect(functionSpans(lines)).toEqual([[0, 4]]);
  });

  it('ignores a stray closing brace before any function opens', () => {
    expect(functionSpans(['}', 'f() {', '}'])).toEqual([[1, 2]]);
  });
});

describe('shellScope', () => {
  const check = shellScope({
    title: 'no local outside a function',
    scripts: ['scripts/*.sh', 'scripts/**/*.sh'],
    when: () => true,
  });

  const runOver = (tree: Record<string, string>, tracked?: readonly string[]): Promise<IVerdict> =>
    runCheck(check, { tree, tracked });

  it('is a product-zone, read-only check', () => {
    expect(check).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
  });

  it('passes over clean scripts and says how many it read — each file once, whatever overlaps', async () => {
    // `scripts/*.sh` and `scripts/**/*.sh` both select a.sh; counted twice, the pass line
    // would claim a corpus larger than the one examined.
    const verdict = await runOver({ 'scripts/a.sh': 'f() {\n  local x\n}\n', 'scripts/ci/b.sh': 'echo\n' });

    expect(verdict).toEqual({
      ok: true,
      findings: [
        { severity: 'info', message: '✓ shell-scope — 2 shell file(s) examined, clean', ruleId: 'shell-scope' },
      ],
      measured: 0,
    });
  });

  it('reports the file and line of a misplaced local', async () => {
    const verdict = await runOver({ 'scripts/a.sh': 'echo\nlocal x\n' });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]).toMatchObject({ file: 'scripts/a.sh', line: 2 });
    expect(errorsOf(verdict)).toEqual([
      'scripts/a.sh:2 `local x` is outside every function — bash refuses it at run time. Move it inside a function, or drop `local`.',
    ]);
  });

  it('reads only what the pathspecs select — a vendored script is not the host’s to style', async () => {
    const verdict = await runOver({ 'scripts/a.sh': 'echo\n', 'vendor/tool.sh': 'local x\n' });

    expect(verdict.ok).toBe(true);
  });

  it('skips a tracked script the file source cannot read', async () => {
    const verdict = await runOver({ 'scripts/a.sh': 'echo\n' }, ['scripts/a.sh', 'scripts/deleted.sh']);

    expect(verdict.ok).toBe(true);
    // …and counts only what it read.
    expect(verdict.findings[0]?.message).toBe('✓ shell-scope — 1 shell file(s) examined, clean');
  });

  /** A scan that matched nothing is a broken check, not a clean tree. */
  it('fails when it matched no files at all, naming the pathspecs — the corpus floor', async () => {
    const verdict = await runOver({ 'README.md': '# x' });

    expect(errorsOf(verdict)).toHaveLength(1);
    expect(errorsOf(verdict)[0]).toContain(
      'examined 0 shell file(s) — `scripts/*.sh`, `scripts/**/*.sh` matched no tracked script — below the floor of 1.',
    );
    const expected = shellScope({ scripts: 'scripts/*.sh', corpus: { atLeast: 0 } });
    expect((await runCheck(expected, { tree: { 'README.md': '# x' } })).ok).toBe(true);
  });

  it('leaves out what `except` names, and says so when that emptied the corpus', async () => {
    const tree = { 'scripts/a.sh': 'echo\n', 'scripts/vendor/tool.sh': 'local x\n' };

    expect(
      (await runCheck(shellScope({ scripts: 'scripts/**/*.sh', except: ['scripts/vendor/**'] }), { tree })).ok,
    ).toBe(true);
    expect((await runCheck(shellScope({ scripts: 'scripts/**/*.sh' }), { tree })).ok).toBe(false);
    const emptied = await runCheck(shellScope({ scripts: 'scripts/vendor/*.sh', except: ['scripts/vendor/**'] }), {
      tree,
    });
    expect(errorsOf(emptied)[0]).toContain('matched no tracked script outside `except`');
  });

  it('honours `ratchet` and the stored threshold', async () => {
    const tree = { 'scripts/a.sh': 'local x\n' };
    const armed = shellScope({ scripts: 'scripts/*.sh', ratchet: 1 });

    expect((await runCheck(armed, { tree })).ok).toBe(true);
    expect((await runCheck(armed, { tree, threshold: 0 })).ok).toBe(false);
  });
});
