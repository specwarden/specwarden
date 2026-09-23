/**
 * Pins `check-changesets.mjs`: a changeset that would fail `changeset version` on release
 * day fails here on the day it is written, and the config cannot drift into versioning a
 * playground.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { changesetProblems, configProblems, pendingChangesets, releasesOf } from './check-changesets.mjs';

const SCRIPT = resolve('scripts/check-changesets.mjs');
const CONFIG = JSON.parse(readFileSync('.changeset/config.json', 'utf8'));

const changeset = (front, body = 'docPaths now follows a link into a subdirectory.') =>
  `---\n${front}\n---\n\n${body}\n`;

describe('a pending changeset', () => {
  it('reads the frontmatter pnpm changeset writes, quoted or not', () => {
    expect(releasesOf(changeset('"@specwarden/docs": patch\nspecwarden: minor'))?.releases).toEqual([
      ['@specwarden/docs', 'patch'],
      ['specwarden', 'minor'],
    ]);
  });

  it('passes when it names real packages with real bumps and says something', () => {
    expect(changesetProblems('brave-owls.md', changeset('"@specwarden/docs": patch'))).toEqual([]);
  });

  it('refuses a package the registry does not publish — the rename changeset version meets on release day', () => {
    // The shape the repository's own history makes likely: the pre-scope name.
    expect(changesetProblems('a.md', changeset('"specwarden-module-docs": patch')).join()).toContain(
      'which the registry does not publish',
    );
  });

  it('refuses a bump that is not patch, minor or major', () => {
    expect(changesetProblems('a.md', changeset('"@specwarden/docs": minr')).join()).toContain('has bump `minr`');
  });

  it('refuses a file with no frontmatter, and one that names nothing', () => {
    expect(changesetProblems('a.md', 'just prose\n').join()).toContain('no frontmatter');
    expect(changesetProblems('a.md', changeset('')).join()).toContain('names no package');
  });

  it('refuses one with no description — it is the line a consumer reads before upgrading', () => {
    expect(changesetProblems('a.md', changeset('"@specwarden/docs": patch', '')).join()).toContain('no description');
  });

  it('leaves the folder README out of the pending list', () => {
    expect(pendingChangesets(['README.md', 'config.json', 'b.md', 'a.md'])).toEqual(['a.md', 'b.md']);
  });
});

describe('the changeset config', () => {
  it('is sound as committed', () => {
    expect(configProblems(CONFIG)).toEqual([]);
  });

  it('refuses a config that would let a changeset version a playground', () => {
    expect(configProblems({ ...CONFIG, privatePackages: { version: true, tag: false } }).join()).toContain(
      'privatePackages.version must be false',
    );
    // Absent means changesets' default, which versions private packages.
    expect(configProblems({ ...CONFIG, privatePackages: undefined }).join()).toContain('privatePackages.version');
  });

  it('refuses restricted access and a base branch that is not main', () => {
    expect(configProblems({ ...CONFIG, access: 'restricted' }).join()).toContain('nobody can install');
    expect(configProblems({ ...CONFIG, baseBranch: 'dev' }).join()).toContain('baseBranch is `dev`');
  });

  it('refuses a repository with no config at all', () => {
    expect(configProblems(undefined).join()).toContain('config.json is missing');
  });
});

it('passes on the repository as it stands', () => {
  expect(execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' })).toContain('changeset config sound');
});
