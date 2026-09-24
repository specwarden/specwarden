/**
 * One name per concept — the glossary's retired words, refused in everything that ships or
 * is read as documentation.
 *
 * `core/GLOSSARY.md` retires a word when a concept had two names: "gate" and "check" for
 * one thing in 875 lines, "harness" for both the product and its self-checks, "rule" for
 * four types. A retired word left in a docblock or a message is the copy a reader finds,
 * and it teaches the old name back — so retiring a word is this pattern, not a sweep that
 * got most of them.
 *
 * WHAT IS LEFT OUT, and why each: the glossary and the vocabulary skill name the retired
 * words on purpose; changesets and plans are history; tests quote a retired name to prove
 * it is refused; the one constant that names the old config file does so to refuse it.
 */
import { forbidPattern } from 'specwarden';

/** Each retired word, as the glossary's table lists it. */
const RETIRED = [
  /warden\.config\.mjs/,
  /\bIWardenConfig\b/,
  /SpecWarden/,
  /\b[Tt]he warden\b/,
  /\bgate\(s\)/,
  /\b[Hh]arness\b/,
  /\b[Aa]rbiter/,
  /\b[Pp]erimeter rules?\b/,
  /\b[Rr]ule registry\b/,
  /\bCheckRegistry\b/,
  /\bcommandRule\b/,
  /\bwriteRule\b/,
  /\bratchetId\b/,
];

export const check = forbidPattern({
  id: 'vocabulary',
  title: 'no retired word in what ships or is read as documentation',
  files: ['**/*.md', '**/*.ts', '**/*.mjs', '**/*.mts', '**/*.json', '**/*.yml'],
  except: [
    'core/GLOSSARY.md',
    'core/skills/specwarden/glossary.md',
    'skills/vocabulary/SKILL.md',
    '.changeset/**',
    '_plans/**',
    '**/CHANGELOG.md',
    '**/*.spec.ts',
    '**/*.test.mjs',
    '_playgrounds/journeys/**',
    // Names the old file to refuse it; its spec proves the refusal.
    'core/src/runtime/cli/_shared/find-config/find-config.util.ts',
    // Maps the retired config keys to their new names, to refuse them by name.
    'core/src/runtime/cli/run-cli/run-cli.command.ts',
    // This file: the patterns above ARE the retired words.
    '.specwarden/checks/repository/vocabulary.check.mjs',
  ],
  pattern: new RegExp(RETIRED.map((re) => re.source).join('|'), 'g'),
  message: 'uses the retired word `{match}` — core/GLOSSARY.md names the word to say instead.',
  rule: {
    id: 'one-name-per-concept',
    statement: 'every concept goes by the one name the glossary gives it, in code, options, output and documents',
    owner: 'skills/vocabulary/SKILL.md',
  },
});
