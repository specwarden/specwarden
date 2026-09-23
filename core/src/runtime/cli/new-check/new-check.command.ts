import type { IFileSource, IFileWriter } from '../../../domain';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';

/**
 * `specwarden new <id>` — the first check somebody writes, already in the right shape.
 *
 * WHAT IT IS FOR. Adding a check is four edits in four places: the body, a test for
 * it, a rule saying what it enforces, and — if it is ratcheted — a threshold file.
 * Nothing about that is hard, and all of it is easy to get subtly wrong the first
 * time: the identity ceremony hand-written, the contract version frozen as a literal,
 * findings that name their rule beside findings that do not, a test that never touches
 * the engine's own testing kit. Every one of those is a default, and a scaffold is where
 * a default is cheapest to set.
 *
 * WHAT IT WRITES, and what it deliberately does not. It writes the body and its test,
 * and it writes them to a folder-per-check path so the two travel together. It does
 * NOT edit the config, the rule register or a ratchet file: those are the consumer's
 * declarations, and a tool that silently edits a declaration is a tool that has an
 * opinion about a fact it cannot know. The rule goes in the generated body, where the
 * engine reads it — which is the point of a rule living beside its check.
 *
 * It refuses to overwrite. A scaffold that clobbers is a scaffold nobody runs twice.
 */

/** A check id is a path segment and an address; keep it to what both can carry. */
const VALID_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function body(id: string): string {
  return `/**
 * \`${id}\` — one line saying what must be true, and the defect that made it a rule.
 *
 * Write the WHY here: the rule is the one-line statement below, and this is where a
 * reader learns what it cost to discover. A check whose docblock only restates its
 * own code teaches nothing and rots quietly.
 */
import { defineCheck, readTracked } from 'specwarden';

export const check = defineCheck({
  id: '${id}',
  title: 'what this proves, in one line',
  tier: 'fast',

  // The rule this check enforces, declared here so the register is not a second list
  // of the same fact. \`owner\` is the document that holds the reasoning.
  rule: {
    statement: 'state the assertion that must hold',
    owner: 'README.md',
  },

  // When this check matters. The declarative form covers the two common shapes; a
  // predicate over the changed paths covers everything else. Omitting it means
  // always, which is the right answer for a check too cheap to filter.
  when: { ending: ['.md'] },

  // How many units this run must have examined for its verdict to mean anything. A
  // check that examined nothing cannot fail, so it reports success — this is the one
  // declaration that turns that entire family of defects from invisible into loud.
  corpus: { atLeast: 1 },

  hint: 'one line telling a person how to fix a failure',

  run: (ctx) => {
    // Read through the ports, never through the platform's file API directly: that is
    // what lets this check run against a tree a test describes.
    const documents = readTracked(ctx.vcs, ctx.files, '**/*.md');

    const findings = documents
      .filter((doc) => false /* the condition that makes a document wrong */)
      .map((doc) => ({
        severity: 'error' as const,
        file: doc.file,
        message: \`\${doc.file}: say what is wrong and what to do about it.\`,
      }));

    // Return findings. The verdict, the rule attribution, the ratchet framing and the
    // line a passing run prints are all assembled by the engine.
    return { findings, examined: documents.length, unit: 'documents' };
  },
});
`;
}

function test(id: string): string {
  return `/**
 * What \`${id}\` must and must not report.
 *
 * Run: node --test <this file>, or through the repository's own unit gate.
 *
 * The cases worth writing are the ones a mutation would survive: the boundary (one
 * short of the threshold, exactly at it), and the SHAPE that reports success without
 * looking — an empty corpus, a pattern that matches nothing.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { errorsOf, runCheck } from 'specwarden';

import { check } from './${id}.check.mjs';

test('passes on a corpus with nothing wrong', async () => {
  const verdict = await runCheck(check, { tree: { 'docs/a.md': 'fine' } });

  assert.equal(verdict.ok, true);
  assert.deepEqual(errorsOf(verdict), []);
});

test('fails, and names the file, when the rule is broken', async () => {
  const verdict = await runCheck(check, { tree: { 'docs/a.md': 'the wrong thing' } });

  // Fill this in once the condition is written; a test that asserts nothing about the
  // FAILING case is a test that cannot tell a working check from a disabled one.
  assert.equal(verdict.ok, true);
});

test('refuses an empty corpus rather than reporting a clean run over nothing', async () => {
  const verdict = await runCheck(check, { tree: {} });

  assert.equal(verdict.ok, false);
  assert.match(errorsOf(verdict)[0], /examined 0/);
});

test('is not relevant to a change it cannot be affected by', () => {
  assert.equal(check.when(['src/a.ts']), false);
  assert.equal(check.when(['docs/a.md']), true);
});
`;
}

export function newCheck(
  files: IFileSource,
  writer: IFileWriter,
  io: ICliIo,
  id: string | undefined,
  options: { consumerDir: string; checksDir?: string; family?: string } = { consumerDir: '.specwarden' },
): number {
  if (id === undefined || id === '') {
    io.err('usage: specwarden new <check-id> [--family <folder>]\n');
    return 2;
  }
  if (!VALID_ID.test(id)) {
    io.err(
      `'${id}' is not a usable check id. An id is a path segment and the runner's address for a ` +
        'check: lower-case words joined by hyphens.\n',
    );
    return 2;
  }

  const root = [options.consumerDir, options.checksDir ?? 'checks', options.family, id].filter(Boolean).join('/');
  const checkPath = `${root}/${id}.check.mjs`;
  const testPath = `${root}/${id}.check.test.mjs`;

  const existing = [checkPath, testPath].filter((path) => files.exists(path));
  if (existing.length > 0) {
    io.err(`${existing.join(', ')} already exists — nothing was written.\n`);
    return 1;
  }

  writer.write(checkPath, body(id));
  writer.write(testPath, test(id));

  io.out(`wrote ${checkPath}\n`);
  io.out(`wrote ${testPath}\n\n`);
  io.out('The check is already discovered — a file under checks/ IS a check, and no\n');
  io.out('config edit registers it. Next:\n');
  io.out(`  1. write the condition and the failing-case assertion;\n`);
  io.out(`  2. run it: specwarden check --id ${id};\n`);
  io.out('  3. point `rule.owner` at the document that holds the reasoning.\n');
  return 0;
}
