/**
 * Pins `check-publishable.mjs`: every way a manifest can reach npm unfit, refused.
 *
 * Each case starts from the manifest the scaffolder GENERATES for a real package and
 * breaks exactly one thing, so a case that passes proves the rule it names and nothing
 * else — and the baseline passing proves the rules do not fire on what actually ships.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isSibling, publishProblems } from './check-publishable.mjs';
import { PACKAGES, pkgDir } from './registry.mjs';
import { generated } from './scaffold.mjs';

const SCRIPT = resolve('scripts/check-publishable.mjs');

const byKind = (kind) => PACKAGES.find((p) => p.kind === kind);
const ENGINE = byKind('core');
const TEMPLATE = byKind('template');

/** The manifest `pnpm scaffold` writes for a package — what would actually be packed. */
const shipped = (pkg) => JSON.parse(generated().get(`${pkgDir(pkg)}/package.json`));

const problemsWith = (pkg, edit, options) => {
  const manifest = shipped(pkg);
  edit(manifest);
  return publishProblems(pkg, manifest, options);
};

describe('publish readiness', () => {
  it('finds nothing wrong with any manifest the scaffolder generates', () => {
    for (const pkg of PACKAGES) expect(publishProblems(pkg, shipped(pkg))).toEqual([]);
  });

  it('refuses a package marked private — pnpm publish skips it in silence', () => {
    expect(problemsWith(TEMPLATE, (m) => (m.private = true)).join()).toMatch(/private: true/);
  });

  it.each(['name', 'version', 'description', 'license', 'homepage'])('refuses a manifest with no %s', (field) => {
    expect(problemsWith(TEMPLATE, (m) => delete m[field]).join()).toContain(`has no \`${field}\``);
  });

  it('refuses a licence other than the one the repository publishes under', () => {
    expect(problemsWith(TEMPLATE, (m) => (m.license = 'ISC')).join()).toContain('declares licence `ISC`');
  });

  it('refuses a repository directory that points npm at the root instead of the package', () => {
    expect(problemsWith(TEMPLATE, (m) => delete m.repository.directory).join()).toContain('repository.directory');
  });

  it('refuses a files list without dist, and one without the licence', () => {
    const noDist = problemsWith(TEMPLATE, (m) => (m.files = m.files.filter((f) => f !== 'dist')));
    const noLicense = problemsWith(TEMPLATE, (m) => (m.files = m.files.filter((f) => f !== 'LICENSE')));

    expect(noDist.join()).toContain('would carry no code');
    expect(noLicense.join()).toContain('no copy of the terms');
  });

  it('refuses a bin whose directory the tarball would not carry', () => {
    // The engine's CLI shim is deliberately uncompiled, so `dist` alone ships a command
    // that installs and then cannot start.
    expect(problemsWith(ENGINE, (m) => (m.files = m.files.filter((f) => f !== 'bin'))).join()).toContain(
      'fail to start',
    );
  });

  it('refuses a bin whose shebang line ends in CRLF — it would not start on Linux or macOS', () => {
    // A checkout on a machine with `core.autocrlf=true` rewrites the shim to CRLF, and the
    // tarball carries what the working tree holds: `env` then looks for `node\r`. Every
    // Windows check passes, because Windows starts the command through its own shim.
    const crlf = publishProblems(ENGINE, shipped(ENGINE), { read: () => '#!/usr/bin/env node\r\nimport x;\n' });
    const lf = publishProblems(ENGINE, shipped(ENGINE), { read: () => '#!/usr/bin/env node\nimport x;\n' });

    expect(crlf.join()).toContain('CRLF');
    expect(lf).toEqual([]);
  });

  it('refuses a missing LICENSE or README on disk', () => {
    const problems = publishProblems(TEMPLATE, shipped(TEMPLATE), { has: () => false });

    expect(problems.join()).toContain('no LICENSE file');
    expect(problems.join()).toContain('no README.md');
  });

  it('treats 0.0.0 as a defect only while a release is being cut', () => {
    expect(problemsWith(TEMPLATE, (m) => (m.version = '0.0.0'))).toEqual([]);
    expect(problemsWith(TEMPLATE, (m) => (m.version = '0.0.0'), { releasing: true }).join()).toContain(
      'still at 0.0.0',
    );
  });

  describe('a sibling pinned instead of followed', () => {
    it('knows every package in the registry as a sibling, scoped or not', () => {
      // The defect this pins: siblings were recognised by the prefix `specwarden`, so
      // after the move to `@specwarden/*` only the engine still counted.
      for (const pkg of PACKAGES) expect(isSibling(shipped(pkg).name)).toBe(true);
      expect(isSibling('specwarden-lookalike')).toBe(false);
      expect(isSibling('@specwarden/not-in-the-registry')).toBe(false);
    });

    it('refuses the engine pinned at a fixed version', () => {
      expect(problemsWith(TEMPLATE, (m) => (m.dependencies.specwarden = '0.3.0')).join()).toContain(
        'pins the sibling `specwarden`',
      );
    });

    it('refuses a SCOPED sibling pinned at a fixed version', () => {
      const problems = problemsWith(TEMPLATE, (m) => (m.dependencies['@specwarden/scaffold-parts'] = '^0.3.0'));

      expect(problems.join()).toContain('pins the sibling `@specwarden/scaffold-parts`');
    });

    it('leaves a third-party dependency alone, whatever its range', () => {
      expect(problemsWith(TEMPLATE, (m) => (m.dependencies['left-pad'] = '1.3.0'))).toEqual([]);
    });
  });

  it('passes on the repository as it stands, and says how many it looked at', () => {
    const output = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });

    expect(output).toContain(`${PACKAGES.length} package(s) fit to publish`);
  });
});
