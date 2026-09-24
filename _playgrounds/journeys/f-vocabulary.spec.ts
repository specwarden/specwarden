import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ROOT, removeScratch, scratchTree, specwarden } from '../../scripts/playgrounds.mjs';

/**
 * Journey F — the vocabulary a consumer meets.
 *
 * `core/GLOSSARY.md` names every term once, and lists the words it retired. This journey
 * holds the product to it from the consumer's side: one day's session through the real CLI
 * — adopt, suggest, init, new, check in every reporter, doctor, the usage, the refusals —
 * over a repository with every package installed, and the documents each package SHIPS,
 * read from where an install puts them. A retired word in any of it is a scene that fails,
 * naming the output it appeared in.
 *
 * The vocabulary gate refuses the same words in this repository's sources; this is the
 * other half — what reaches somebody else's terminal and somebody else's agent.
 */

const PLAYGROUND = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MANIFEST = JSON.parse(readFileSync(join(PLAYGROUND, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
/** Every published package, as an install links it. */
const INSTALLED = Object.keys(MANIFEST.dependencies).map(
  (name) => [name, join(PLAYGROUND, 'node_modules', ...name.split('/'))] as const,
);

const GLOSSARY = readFileSync(join(ROOT, 'core', 'GLOSSARY.md'), 'utf8').replace(/\r\n/g, '\n');

/**
 * The retired words, as patterns — each one a row of the glossary's table, which the first
 * scene holds them to. `ratchetDirection` is the option; the self-check `ratchet-direction`
 * keeps its name.
 */
const RETIRED: readonly [string, RegExp][] = [
  ['warden.config.mjs', /warden\.config\.mjs/],
  ['IWardenConfig', /\bIWardenConfig\b/],
  ['SpecWarden', /SpecWarden/],
  ['the warden', /\bthe warden\b/i],
  ['gate(s)', /\bgate\(s\)/i],
  ['harness', /\bharness\b/i],
  ['rule registry', /\brule registry\b/i],
  ['CheckRegistry', /\bCheckRegistry\b/],
  ['commandRule', /\bcommandRule\b/],
  ['writeRule', /\bwriteRule\b/],
  ['perimeter rule', /\bperimeter rules?\b/i],
  ['ratchetId', /\bratchetId\b/],
  ['arbiter', /\barbiter\b/i],
];

/** Every output of one consumer's day, labelled by the command that printed it. */
const said: [string, string][] = [];
let dir = '';

const TREE: Record<string, string> = {
  'README.md': '# tiny\n\nThe entry is `src/index.ts`. See `docs/usage.md`.\n',
  'docs/usage.md': '# Usage\n\nRun the tests.\n',
  'package.json': `${JSON.stringify({ name: 'tiny', type: 'module', scripts: { test: 'node --test' }, devDependencies: Object.fromEntries(INSTALLED.map(([name]) => [name, '*'])) }, null, 2)}\n`,
  'src/index.ts': 'export const main = () => 1;\n',
  'src/util.ts': 'export const util = () => 2; // TODO later\n',
  'src/util.test.ts': 'test\n',
  'src/index.test.ts': 'test\n',
  'src/other.ts': 'export {};\n',
  'src/other.test.ts': 'test\n',
};

/** Checks written the way the guides say, across the engine and the modules. */
const CHECK_FILES: Record<string, string> = {
  '.specwarden/checks/hygiene/no-todo.check.mjs':
    "import { forbidPattern } from 'specwarden';\nexport const check = forbidPattern({ files: 'src/**/*.ts', pattern: /TODO/, rule: 'no TODO left in shipped source' });\n",
  '.specwarden/checks/docs/doc-paths.check.mjs':
    "import { docPaths } from '@specwarden/docs';\nexport const check = docPaths({ docs: '**/*.md' });\n",
  '.specwarden/checks/security/secret-scan.check.mjs':
    "import { secretScan } from '@specwarden/security';\nexport const check = secretScan({});\n",
  '.specwarden/checks/workspace/unit.check.mjs':
    "import { commandCheck } from 'specwarden';\nexport const check = commandCheck({ cmd: 'node -e \"console.log(1)\"', expect: /1/, rule: 'the suite passes' });\n",
};

const run = (label: string, args: readonly string[]) => {
  const r = specwarden(dir, args);
  said.push([label, `${r.stdout}\n${r.stderr}`]);
  return r;
};

beforeAll(() => {
  dir = scratchTree(TREE, { installed: INSTALLED });
  run('adopt', ['adopt']);
  run('suggest', ['suggest']);
  run('init', ['init']);
  for (const [path, body] of Object.entries(CHECK_FILES)) {
    const full = join(dir, path);
    // Written after init, as a consumer adds them; tracked, as a check reads them.
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  run('check --all', ['check', '--all']);
  run('check --all --json', ['check', '--all', '--json']);
  run('check --all --reporter github', ['check', '--all', '--reporter', 'github']);
  run('check --list', ['check', '--list']);
  run('check --list --json', ['check', '--list', '--json']);
  run('doctor', ['doctor']);
  run('doctor --json', ['doctor', '--json']);
  run('--help', ['--help']);
  run('an id typed wrong', ['check', '--all', '--id', 'no-tod']);
  run('a flag typed wrong', ['check', '--tighen']);
  run('new', ['new', 'x-y', '--family', 'hygiene']);
  run('new over it again', ['new', 'x-y', '--family', 'hygiene']);
}, 300_000);

afterAll(() => {
  if (dir) removeScratch(dir);
});

describe('F. the glossary is the contract', () => {
  it('lists every retired word this journey refuses, with the word to say instead', () => {
    const table = GLOSSARY.slice(GLOSSARY.indexOf('## Retired words'));
    for (const [word] of RETIRED) expect(table, word).toContain(word);
  });

  it('ships beside the engine skill as the same document, generated from it', () => {
    const shipped = readFileSync(join(ROOT, 'core', 'skills', 'specwarden', 'glossary.md'), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
    expect(shipped).toContain('<!-- GENERATED from core/GLOSSARY.md. Edit the glossary. -->');
    expect(shipped).toContain('**rule register**');
  });

  it('defines every term the command line prints in its usage and its summaries', () => {
    const usage = said.find(([label]) => label === '--help')?.[1] ?? '';
    for (const term of ['check', 'tier', 'relevance', 'perimeter', 'plan', 'ratchet', 'self-checks', 'spec source']) {
      expect(GLOSSARY, term).toMatch(new RegExp(`\\*\\*${term}\\*\\*`, 'i'));
    }
    expect(usage).toContain('check');
  });
});

describe('F. what reaches a consumer’s terminal', () => {
  it('a whole day of commands prints no retired word', () => {
    const found = said.flatMap(([label, text]) =>
      RETIRED.filter(([, pattern]) => pattern.test(text)).map(([word]) => `${label}: ${word}`),
    );
    expect(found).toEqual([]);
  });

  it('every JSON document carries its version', () => {
    for (const [label, text] of said.filter(([l]) => l.includes('--json'))) {
      const doc = JSON.parse(text.slice(0, text.lastIndexOf('}') + 1)) as { version?: unknown };
      expect(doc.version, label).toBeTypeOf('number');
    }
  });

  it('the run summary counts checks, and the refusals end with a period', () => {
    const summary = said.find(([label]) => label === 'check --all')?.[1] ?? '';
    expect(summary).toMatch(/check\(s\)/);
    for (const label of ['an id typed wrong', 'a flag typed wrong', 'new over it again']) {
      const text = said.find(([l]) => l === label)?.[1].trim() ?? '';
      expect(text.split('\n')[0], label).toMatch(/\.$|\)\.?$/);
    }
  });

  it('the tree init wrote names its files the glossary’s way and uses no retired word', () => {
    expect(existsSync(join(dir, '.specwarden', 'config.mjs'))).toBe(true);
    expect(existsSync(join(dir, '.specwarden', 'warden.config.mjs'))).toBe(false);
    for (const file of ['config.mjs', 'rules.mjs', 'README.md', 'checks/README.md']) {
      const text = readFileSync(join(dir, '.specwarden', file), 'utf8');
      for (const [word, pattern] of RETIRED) expect(pattern.test(text), `${file}: ${word}`).toBe(false);
    }
  });
});

describe('F. what reaches a consumer’s agent', () => {
  /** Every markdown file a package ships under `skills/`, read from where an install puts it. */
  const shipped = (): [string, string][] =>
    INSTALLED.flatMap(([name, source]) => {
      const skills = join(source, 'skills');
      if (!existsSync(skills)) return [];
      return readdirSync(skills, { recursive: true })
        .map(String)
        .filter((file) => file.endsWith('.md') && !file.endsWith('glossary.md'))
        .map((file) => [`${name}/skills/${file}`, readFileSync(join(skills, file), 'utf8')] as [string, string]);
    });

  it('every shipped skill and reference uses no retired word', () => {
    const files = shipped();
    expect(files.length).toBeGreaterThan(5);
    const found = files.flatMap(([path, text]) =>
      RETIRED.filter(([, pattern]) => pattern.test(text)).map(([word]) => `${path}: ${word}`),
    );
    expect(found).toEqual([]);
  });

  it('every package README and GUIDE uses no retired word', () => {
    const docs = INSTALLED.flatMap(([name, source]) =>
      ['README.md', 'GUIDE.md']
        .filter((file) => existsSync(join(source, file)))
        .map((file) => [`${name}/${file}`, readFileSync(join(source, file), 'utf8')] as [string, string]),
    );
    const found = docs.flatMap(([path, text]) =>
      RETIRED.filter(([, pattern]) => pattern.test(text)).map(([word]) => `${path}: ${word}`),
    );
    expect(found).toEqual([]);
  });
});
