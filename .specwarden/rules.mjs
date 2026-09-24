/**
 * What this repository asserts about itself.
 *
 * A rule names the document that owns its reasoning and the check that proves it. A rule
 * with no enforcer is allowed WHEN IT SAYS WHY — a reason, never an apology — and a
 * check that enforces no rule is a defect, because an unattributed check is one nobody
 * can argue with, relax deliberately, or retire.
 *
 * Most rules here are declared ON the check that enforces them, which is where a rule
 * enforced by exactly one check belongs. What stays in this file is what can live
 * nowhere else: a rule no single check owns, and a rule nothing can check.
 */
export const rules = [
  {
    id: 'engine-depends-on-nothing',
    statement: 'the engine imports no module, plugin or template — everything depends on core, and core on nothing',
    owner: 'skills/structure/SKILL.md',
    enforcement: { enforcedBy: ['lint'] },
    zone: 'consumer',
    /**
     * Not undoable in the sense that matters: the day core imports a module, a consumer
     * installing the engine starts installing somebody's opinion about documentation,
     * and every version after that is a version somebody depends on.
     */
    irreversible: true,
    card: 'Never import a module, plugin or template from `core/` — the engine depends on nothing',
  },
  // `generated-files-are-not-edited` is declared ON the `scaffold-drift` check, which is
  // where a rule enforced by exactly one check belongs. The engine refuses the same id in
  // both places — there is no correct merge between two equally entitled copies, and
  // picking one silently is how the other's wording stops being true without being
  // deleted. It refused this on the very first run of this config.
  {
    id: 'published-surface-is-one-door',
    statement: 'every package publishes exactly one entry point, and what it publishes is reachable from a tarball',
    owner: 'skills/publishing/SKILL.md',
    enforcement: { enforcedBy: ['publishable', 'verify-build'] },
    zone: 'consumer',
  },
  {
    id: 'a-check-is-tested-against-a-tree-it-describes',
    statement: 'every package proves its own behaviour, and the engine proves its tests would notice it breaking',
    owner: 'skills/testing/SKILL.md',
    enforcement: { enforcedBy: ['unit', 'scripts-unit'] },
    zone: 'consumer',
  },
  {
    id: 'the-router-has-one-wording',
    statement: 'AGENTS.md and CLAUDE.md are one router under two names, and the second is generated',
    owner: 'AGENTS.md',
    enforcement: { enforcedBy: ['router-mirror'] },
    zone: 'consumer',
  },
  {
    id: 'a-shipped-skill-is-installable',
    statement: 'every shipped skill is listed in the marketplace, carries a plugin manifest, and ships in its package',
    owner: 'skills/skills/SKILL.md',
    enforcement: { enforcedBy: ['skills'] },
    zone: 'consumer',
  },
  {
    id: 'a-template-produces-a-green-tree',
    statement:
      'every template, run over a repository of its kind, writes a tree that passes `check --all` with nothing edited in between — and every check it writes has been seen to fail',
    owner: 'skills/playgrounds/SKILL.md',
    // Two halves: `playgrounds` holds the committed tree to what init writes today; the
    // template's own playground spec, run by `unit`, proves that tree green and each of its
    // checks red once.
    enforcement: { enforcedBy: ['playgrounds', 'unit'] },
    zone: 'consumer',
  },
  {
    id: 'the-lockfile-is-what-ci-installs',
    statement:
      'the committed lockfile satisfies every manifest, so a local install and a CI install resolve the same tree',
    owner: 'CONTRIBUTING.md',
    enforcement: { enforcedBy: ['lockfile'] },
    zone: 'consumer',
  },
  {
    id: 'types-compile-in-every-package',
    statement: 'every package typechecks on its own, in its own program',
    owner: 'skills/typescript/SKILL.md',
    enforcement: { enforcedBy: ['typecheck'] },
    zone: 'consumer',
  },
  {
    id: 'one-formatting',
    statement: 'source formatting is decided by a formatter, not by review',
    owner: 'CONTRIBUTING.md',
    enforcement: { enforcedBy: ['format'] },
    zone: 'consumer',
  },

  {
    id: 'a-landed-plan-is-harvested-and-deleted',
    statement:
      'a plan whose work has landed is harvested into the canon and deleted — an active plan’s branch resolves',
    owner: 'skills/plans/SKILL.md',
    enforcement: { enforcedBy: ['plan-staleness'] },
    zone: 'consumer',
  },
  {
    id: 'a-version-is-cut-by-a-changeset',
    statement: 'a released version comes from a changeset, never from an edited manifest',
    owner: 'skills/publishing/SKILL.md',
    enforcement: {
      notMechanizable:
        'the check would have to know which commits SHOULD have carried a changeset, and "this change is user-visible" is the judgement the changeset exists to record. What is mechanized is the consequence: the scaffolder reads a version and never writes one, so a hand-edited number is reverted rather than released.',
    },
    zone: 'consumer',
  },
];
