/**
 * Every package, against what npm needs before it will be useful to anybody.
 *
 * Not that it BUILDS — `verify-build.mjs` answers that by installing the tarball — but
 * that it has a name, a version, a licence, a repository address and a description, that
 * it is not marked private, and that the `files` list carries what the package cannot run
 * without.
 *
 * WHY IT IS A SEPARATE CHECK AND NOT "we will see at publish time". The window to
 * unpublish a version is 72 hours and exists once. A package published without a licence,
 * with a description left over from another package, or with `bin` missing from `files`,
 * can be unpublished exactly once in that version's life; for all the rest of the time
 * the consumer sees what shipped.
 *
 * Run: node scripts/check-publishable.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ORIGIN, PACKAGES, pkgDir, pkgName } from './registry.mjs';

const ROOT = process.cwd();

/**
 * Whether a release is being cut right now.
 *
 * `pnpm release` passes it; an ordinary `pnpm check` does not, so the rules that matter
 * only at the moment of publishing do not paint a pre-release repository red. A check
 * that is red for a reason nobody can act on yet is a check everybody learns to skip,
 * and the findings beside it go with it.
 */
const RELEASING = process.argv.includes('--releasing');

/** Fields npm shows on the package page. Absent, each one is a page that looks abandoned. */
const REQUIRED_STRINGS = ['name', 'version', 'description', 'license', 'homepage'];

const problems = [];

for (const pkg of PACKAGES) {
  const dir = pkgDir(pkg);
  const manifest = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'));
  const at = (message) => problems.push(`${pkgName(pkg)}: ${message}`);

  if (manifest.private === true) {
    at(
      'is marked `private: true` — `pnpm publish` skips it in silence, and a release that skipped a package looks exactly like one that shipped it.',
    );
  }

  for (const field of REQUIRED_STRINGS) {
    const value = manifest[field];
    if (typeof value !== 'string' || value.trim().length === 0) at(`has no \`${field}\`.`);
  }

  /**
   * `0.0.0` means "never released", which is a legitimate state for a repository that
   * has not released yet — so it is a failure only when a release is actually being
   * cut. Failing on it always would paint the whole pre-release period red and teach
   * everybody to run `check` with something skipped, which is the habit that makes the
   * rest of these findings invisible too.
   */
  if (RELEASING && manifest.version === '0.0.0') {
    at('is still at 0.0.0 — run `pnpm changeset` and `pnpm version:packages` before releasing.');
  }
  if (manifest.license !== ORIGIN.license) at(`declares licence \`${manifest.license}\`, not ${ORIGIN.license}.`);
  if (typeof manifest.repository?.url !== 'string') at('has no `repository.url` — npm will show no sources.');
  if (manifest.repository?.directory !== dir)
    at(`\`repository.directory\` must be "${dir}" so npm links at the package rather than the root.`);

  /**
   * `files` decides the tarball, and the two ways it goes wrong are opposite.
   *
   * Missing `dist` publishes a package with no code — and locally everything looks
   * right, because locally `dist` is there. Missing `bin` publishes a `specwarden`
   * command whose entry point is not in the tarball, so the install succeeds and the
   * first invocation fails with a module-not-found on a path the user cannot see.
   */
  const files = manifest.files ?? [];
  if (!files.includes('dist')) at('does not list `dist` in `files` — the tarball would carry no code.');
  if (!files.includes('LICENSE'))
    at('does not list `LICENSE` in `files` — a consumer installing from npm has no copy of the terms.');
  if (manifest.bin) {
    const missing = Object.values(manifest.bin)
      .map((entry) => entry.replace(/^\.\//, '').split('/')[0])
      .filter((top) => !files.includes(top));
    if (missing.length)
      at(
        `declares a \`bin\` under ${missing.join(', ')}/ which \`files\` does not carry — the command would install and then fail to start.`,
      );
  }

  if (!existsSync(join(ROOT, dir, 'LICENSE'))) at('has no LICENSE file — run `pnpm scaffold`.');
  if (!existsSync(join(ROOT, dir, 'README.md'))) at('has no README.md — run `pnpm scaffold`.');

  /**
   * A `workspace:` range is what pnpm substitutes with a real version at pack time, so
   * finding one in the manifest is correct and finding one in the TARBALL is the defect
   * — which `verify-build.mjs` looks for, from the tarball. What is caught here is the
   * opposite mistake: a sibling pinned to a fixed version, which stops following the
   * release and installs whatever was on npm the day somebody typed it.
   */
  for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
    if (!name.startsWith('specwarden')) continue;
    if (!String(range).startsWith('workspace:')) {
      at(
        `pins the sibling \`${name}\` at \`${range}\` instead of \`workspace:^\` — it would stop following this repository's own releases.`,
      );
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `${problems.length} package(s) are not fit to publish:\n\n${problems.map((p) => `  - ${p}`).join('\n')}\n\n` +
      'The undo window on npm is 72 hours and exists once per version.\n',
  );
  process.exit(1);
}

process.stdout.write(`✓ ${PACKAGES.length} package(s) fit to publish\n`);
