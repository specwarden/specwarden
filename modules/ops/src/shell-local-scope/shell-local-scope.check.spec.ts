import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';
import { stripHeredocs } from 'specwarden';
import { functionSpans, localOutsideFunction, shellLocalScope } from './shell-local-scope.check';

/**
 * Carried verbatim from the consumer-side check this replaced. Every case is a shape the
 * scan got wrong at some point — the main block that is not a function, the nested block
 * that is, the heredoc body that must not fire the rule and must not shift the line number.
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
    const script = [
      'do_thing() {',
      '  if [ -n "$1" ]; then',
      '    local inner',
      '    inner=1',
      '  fi',
      '}',
    ].join('\n');

    expect(localOutsideFunction(script)).toEqual([]);
  });

  it('treats a heredoc body as data, and keeps the reported line true', () => {
    const script = [
      'write_note() {',
      "  cat > /tmp/x <<'EOF'",
      'local this is prose',
      'EOF',
      '}',
      'local real',
    ].join('\n');

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

describe('shellLocalScope', () => {
  const check = shellLocalScope({
    id: 'shell-local-scope',
    title: 'no local outside a function',
    pathspecs: ['scripts/*.sh'],
    when: () => true,
  });

  const runOver = (files: Record<string, string>) => {
    const source = new InMemoryFileSource(files, '');
    const vcs = { trackedFiles: () => Object.keys(files) };
    return check.run({ files: source, vcs } as never);
  };

  it('passes over clean scripts and says how many it read', () => {
    const verdict = runOver({ 'scripts/a.sh': 'f() {\n  local x\n}\n' });

    expect(verdict.ok).toBe(true);
    expect(verdict.findings[0]?.message).toContain('1 shell file');
  });

  it('reports the file and line of a misplaced local', () => {
    const verdict = runOver({ 'scripts/a.sh': 'local x\n' });

    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]?.file).toBe('scripts/a.sh');
    expect(verdict.findings[0]?.message).toContain('scripts/a.sh:1');
  });

  /** A scan that matched nothing is a broken check, not a clean tree. */
  it('fails when it matched no files at all', () => {
    const verdict = runOver({});

    expect(verdict.ok).toBe(false);
    expect(verdict.findings[0]?.message).toContain('examined nothing');
  });
});
