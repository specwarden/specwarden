import { describe, expect, it } from 'vitest';

import { IMPORT_RE, matchesSpecifier, testStateless } from './import-specifier.util';

/**
 * The import grammar two bans share. A form it does not recognise is a door through
 * BOTH of them — `forbidImport` and the zone barrier — and neither would say so: a
 * specifier nobody extracted is a specifier nobody checked, and the check stays green.
 */
const specifiers = (source: string): string[] => [...source.matchAll(IMPORT_RE)].map((m) => m[1]);

describe('IMPORT_RE', () => {
  it.each([
    ["import { sql } from 'orm';", 'named import'],
    ['import sql from "orm";', 'default import, double quotes'],
    ["import * as orm from 'orm';", 'namespace import'],
    ["import type { T } from 'orm';", 'type-only import'],
    ["import 'orm';", 'side-effect import'],
    ["export * from 'orm';", 're-export'],
    ["export { sql } from 'orm';", 'named re-export'],
    ["const orm = require('orm');", 'CommonJS require'],
    ["const orm = require ( 'orm' );", 'require with spacing'],
    ["import {\n  a,\n  b,\n} from 'orm';", 'multi-line import'],
  ])('extracts the specifier of %j (%s)', (source) => {
    expect(specifiers(source)).toEqual(['orm']);
  });

  /**
   * `await import('x')` loads the module exactly as a static import does. Unrecognised,
   * it was the one spelling that walked a banned module past both bans — the rule held
   * for every form except the one a determined author would reach for.
   */
  it.each([
    ["const orm = await import('orm');", 'dynamic import'],
    ['const orm = await import ( "orm" );', 'dynamic import with spacing'],
  ])('extracts the specifier of %j (%s)', (source) => {
    expect(specifiers(source)).toEqual(['orm']);
  });

  it('walks every import in a file, in order', () => {
    const source = "import a from 'a';\nimport 'b';\nexport * from 'c';\nconst d = require('d');\n";

    expect(specifiers(source)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores a string that is not in an import position', () => {
    expect(specifiers("const name = 'orm';\nconsole.log('import');\n")).toEqual([]);
  });

  it('is global and shared, yet a second walk over another file starts fresh', () => {
    // `matchAll` clones the regex, so the shared `lastIndex` can never skip the first
    // import of the next file.
    expect(specifiers("import 'first';")).toEqual(['first']);
    expect(specifiers("import 'second';")).toEqual(['second']);
    expect(IMPORT_RE.lastIndex).toBe(0);
  });
});

describe('matchesSpecifier', () => {
  it('matches a string target exactly, or as the package root of a subpath', () => {
    expect(matchesSpecifier('orm', 'orm')).toBe(true);
    expect(matchesSpecifier('orm/pg-core', 'orm')).toBe(true);
  });

  /**
   * A prefix test without the slash would ban `orm-helpers` along with `orm` — a false
   * positive a team fixes by deleting the rule, taking the true positives with it.
   */
  it('does not match a different package that merely shares the prefix', () => {
    expect(matchesSpecifier('orm-helpers', 'orm')).toBe(false);
    expect(matchesSpecifier('@scope/orm', 'orm')).toBe(false);
  });

  it('tests a RegExp target against the specifier', () => {
    expect(matchesSpecifier('../../.specwarden/checks/a.mjs', /\.specwarden\//)).toBe(true);
    expect(matchesSpecifier('./local', /\.specwarden\//)).toBe(false);
  });

  it('gives the same answer for every specifier under a GLOBAL RegExp target', () => {
    const target = /^orm/g;

    expect(['orm', 'orm/a', 'orm/b', 'orm/c'].map((s) => matchesSpecifier(s, target))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('testStateless', () => {
  /**
   * `.test` on a global regex advances `lastIndex`, so the next call starts mid-string
   * and misses — every other match silently fails. On a ban, that is a false negative
   * on every second file.
   */
  it('answers the same for repeated calls with a global regex', () => {
    const re = /BANNED/g;

    expect([1, 2, 3, 4].map(() => testStateless(re, 'x BANNED'))).toEqual([true, true, true, true]);
    expect(re.lastIndex).toBe(0);
  });

  it('keeps the other flags when it strips the global one', () => {
    expect(testStateless(/banned/gi, 'BANNED')).toBe(true);
    expect(testStateless(/^b$/gm, 'a\nb')).toBe(true);
  });

  it('uses a non-global regex as it is, and still refuses a non-match', () => {
    expect(testStateless(/banned/, 'banned')).toBe(true);
    expect(testStateless(/banned/, 'fine')).toBe(false);
  });
});

describe('matchesSpecifier — a target written with its trailing slash', () => {
  // `@db/` was compared as `@db//…`, which no specifier is: a ban that matched nothing.
  it('is a prefix, and only that prefix', () => {
    expect(matchesSpecifier('@db/core', '@db/')).toBe(true);
    expect(matchesSpecifier('@db/core/x', '@db/')).toBe(true);
    expect(matchesSpecifier('@db', '@db/')).toBe(false);
    expect(matchesSpecifier('@dbx/core', '@db/')).toBe(false);
  });
});
