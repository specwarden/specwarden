/**
 * What every template playground proves, written once.
 *
 * A template's `_playground/playground.spec.ts` supplies the one thing that differs — the
 * defects its repository can carry — and this turns them into the scenes:
 *
 * 1. `init --template <name>` over the repository, then `check --all` with nothing edited
 *    in between, is GREEN — the only promise a consumer feels on day one;
 * 2. every check the template wrote has a defect in the list, and the list names no check
 *    the template did not write — so a new part cannot land without a way to see it fail;
 * 3. each defect, planted ALONE, turns exactly its own check red and leaves every other
 *    check green, with a finding that names what was planted.
 *
 * The third is stronger than one broken tree with every defect at once: it proves each
 * check is the one that catches its defect, rather than that something in the run did.
 *
 * The spec hands in its OWN `describe`/`it`/`expect`. Imported here, `vitest` resolves from
 * `scripts/` — and this workspace holds three peer variants of it, so the scenes could
 * register with an instance that is not the one running the suite.
 *
 * Every run is the real CLI over a scratch git repository, because that is what a consumer
 * runs — not a check body called in-process, which would pass over a generated file that
 * cannot even be imported.
 */
import { TEMPLATED, removeScratch, scratchRepository, verdictsIn, warden, writtenByTemplate } from './playgrounds.mjs';
import { pkgName } from './registry.mjs';

/** A CLI run over a scratch repository is seconds, not milliseconds. */
const RUN_TIMEOUT = 180_000;

const sorted = (list) => [...list].sort();

/** Run the CLI over a scratch copy of the template's repository, with `edits` planted. */
function runOver(pkg, edits, branches) {
  const dir = scratchRepository(pkg, { edits, branches });
  try {
    return verdictsIn(dir);
  } finally {
    removeScratch(dir);
  }
}

export function provePlayground(slug, defects, { describe, it, expect, beforeAll, afterAll }, { branches = [] } = {}) {
  const pkg = TEMPLATED.find((p) => p.slug === slug);
  if (!pkg) throw new Error(`no template called ${slug} in the registry`);

  describe(`${pkgName(pkg)} — init, then check, over a repository of its kind`, () => {
    let clean;
    beforeAll(() => {
      clean = runOver(pkg, {}, branches);
    }, RUN_TIMEOUT);
    afterAll(() => {
      clean = undefined;
    });

    it('is green on the first run, with nothing edited after init', () => {
      const red = clean.results.filter((r) => !r.ok && !r.skipped);
      expect(red.map((r) => `${r.id}: ${r.messages.join(' / ')}`)).toEqual([]);
      expect(clean.status).toBe(0);
    });

    it('runs every check it wrote — none skipped, so none is green by not running', () => {
      expect(clean.results.filter((r) => r.skipped).map((r) => r.id)).toEqual([]);
    });

    it('has a defect for every check the template wrote, and none for a check it did not', () => {
      // The list is compared, not merely checked for presence: a defect for a check the
      // template stopped writing is a scene proving nothing, and a check with no defect
      // is one nobody has seen fail.
      expect(sorted(writtenByTemplate(clean.results.map((r) => r.id)))).toEqual(sorted(Object.keys(defects)));
    });

    describe.each(Object.entries(defects))('%s', (id, defect) => {
      it(
        `goes red over ${defect.why} — and nothing else does`,
        () => {
          const broken = runOver(pkg, defect.edits, branches);

          expect(broken.failed).toEqual([id]);
          expect(broken.status).toBe(1);
          // The finding names what was planted, so a red run for some OTHER reason — a
          // generated file that throws, a corpus that came up empty — cannot stand in for
          // the defect this scene is about.
          const said = broken.results.find((r) => r.id === id)?.messages.join('\n') ?? '';
          expect(said).toContain(defect.says);
        },
        RUN_TIMEOUT,
      );
    });
  });
}

/**
 * A scratch copy of a template's repository for a scene of the spec's own — something the
 * shared proof cannot express, like a hook fed a payload on stdin. The copy is removed
 * whatever the scene does.
 */
export function inScratchRepository(slug, setup, scene) {
  const pkg = TEMPLATED.find((p) => p.slug === slug);
  if (!pkg) throw new Error(`no template called ${slug} in the registry`);
  const dir = scratchRepository(pkg, { edits: setup.edits ?? {}, branches: setup.branches ?? [] });
  try {
    return scene({ dir, warden: (args, options) => warden(dir, args, options) });
  } finally {
    removeScratch(dir);
  }
}

/**
 * `text` with `from` replaced by `to` — and a THROW when `from` is not in it.
 *
 * A defect is planted by editing a real file, and `String.replace` over a phrase that is
 * not there returns the file unchanged. The scene then runs over the clean tree, the check
 * is green, and the failure reads as "the check did not catch the defect" when the defect
 * was never planted. It happened on the second playground written: a typographic
 * apostrophe in the spec, an ASCII one in the plan.
 */
export function planted(text, from, to) {
  if (!text.includes(from)) throw new Error(`cannot plant the defect: ${JSON.stringify(from)} is not in the file`);
  return text.replace(from, to);
}
