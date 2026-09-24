import type { IFileSource, IFileWriter } from '../../../domain';
import { type ICliIo, refusal } from '../_shared/cli-io/cli-io.model';

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
 * side by side in the family folder, so the two travel together. It does
 * NOT edit the config, the rule register or a ratchet file: those are the consumer's
 * declarations, and a tool that silently edits a declaration is a tool that has an
 * opinion about a fact it cannot know. The rule goes in the generated body, where the
 * engine reads it — which is the point of a rule living beside its check.
 *
 * It refuses to overwrite. A scaffold that clobbers is a scaffold nobody runs twice.
 */

/** A check id is a path segment and an address; keep it to what both can carry. */
const VALID_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * The body. PLAIN JAVASCRIPT — the file is `.mjs`, and a TypeScript `as const` in it was a
 * SyntaxError that took the whole next run down with it. And RED until its condition is
 * written: the old scaffold filtered on `false`, so it was green over anything, and a
 * check nobody finished reported success from the day it was generated.
 */
function body(id: string, path: string): string {
  return `/**
 * \`${id}\` — one line saying what must be true, and the defect that made it a rule.
 *
 * Write the WHY here: the rule is the one-line statement below, and this is where a
 * reader learns what it cost to discover. A check whose docblock only restates its
 * own code teaches nothing and rots quietly.
 */
import { defineCheck, readTracked } from 'specwarden';

/**
 * What makes a document wrong — THE CONDITION, and the one thing only you can write.
 * Until it is written this check FAILS: a scaffold that passed would be a check nobody
 * finished, reporting green.
 */
const isWrong = undefined; // for example: (doc) => doc.text.includes('TODO')

export const check = defineCheck({
  id: '${id}',

  // The rule this check enforces, in one line. It is also the title \`--list\` prints, and
  // this file is its owner — the place a reader who meets the finding comes to.
  rule: 'state the assertion that must hold',

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
    const examined = documents.length;

    if (isWrong === undefined) {
      const message = 'the condition of ${id} is not written yet — write \`isWrong\` in ${path}.';
      return { findings: [{ severity: 'error', message }], examined, unit: 'documents' };
    }

    const findings = documents.filter(isWrong).map((doc) => ({
      severity: 'error',
      file: doc.file,
      message: \`\${doc.file}: say what is wrong and what to do about it.\`,
    }));

    // Return findings. The verdict, the rule attribution, the ratchet framing and the
    // line a passing run prints are all assembled by the engine.
    return { findings, examined, unit: 'documents' };
  },
});
`;
}

/** The test. Its failing case asserts the FAILURE — the old one asserted \`ok === true\`
 * over "the wrong thing", so it passed against a check that could not fail. Until the
 * condition is written, the first two cases are red, which is the point. */
function test(id: string): string {
  return `/**
 * What \`${id}\` must and must not report.
 *
 * Run: node --test <this file>, or through the repository's own unit check.
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

  assert.equal(verdict.ok, false);
  assert.match(errorsOf(verdict)[0], /docs\\/a\\.md/);
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
    io.err(refusal('usage: specwarden new <check-id> [--family <folder>]'));
    return 2;
  }
  if (!VALID_ID.test(id)) {
    io.err(
      refusal(
        `'${id}' is not a usable check id. An id is a path segment and the runner's address for a ` +
          'check: lower-case words joined by hyphens',
      ),
    );
    return 2;
  }

  // `<family>/<id>.check.mjs`, the test beside it — the layout every README and guide
  // shows. It wrote a folder per check, which no document described.
  const root = [options.consumerDir, options.checksDir ?? 'checks', options.family].filter(Boolean).join('/');
  const checkPath = `${root}/${id}.check.mjs`;
  const testPath = `${root}/${id}.check.test.mjs`;

  const existing = [checkPath, testPath].filter((path) => files.exists(path));
  if (existing.length > 0) {
    // The line could not be used — exit 2 — rather than a check that failed: 1 is the
    // answer "no", and nothing was asked here that could be answered.
    io.err(refusal(`${existing.join(', ')} already exists — nothing was written`));
    return 2;
  }

  writer.write(checkPath, body(id, checkPath));
  writer.write(testPath, test(id));

  io.out(`wrote ${checkPath}\n`);
  io.out(`wrote ${testPath}\n\n`);
  io.out('The check is already discovered — a file under checks/ IS a check, and no\n');
  io.out('config edit registers it. It FAILS until its condition is written. Next:\n');
  io.out('  1. write `isWrong`, the rule, and the message a finding prints;\n');
  io.out(`  2. run it: specwarden check --id ${id} — red over a broken tree, green over a clean one;\n`);
  io.out(`  3. run its test: node --test ${testPath}\n`);
  return 0;
}
