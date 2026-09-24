import { describe, expect, it } from 'vitest';

import { agentDefinitions, parseFrontmatter } from '@specwarden/agents';
import { CheckOptionsError, errorsOf, publishedFactories, runCheck, uncoveredFactories } from 'specwarden';

/**
 * Everything this package publishes, wired the way a consumer wires it.
 *
 * A unit suite imports a unit by PATH and keeps passing over a package whose factory was
 * renamed and never re-exported from the barrel. This imports `@specwarden/agents` by
 * NAME, through the package's own `exports` map, so it fails where the consumer would.
 *
 * The check runs over a roster twice — once as a house would keep it, once with one
 * defect per rule. A check that returns the same verdict for both cannot fail, and one
 * that cannot fail reports success.
 */

const COVERED = ['agentDefinitions'];
const PROBE = { agentsDir: '.claude/agents' };

const definition = (fields: Record<string, string>, body = 'What this role does.\n'): string =>
  ['---', ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), '---', '', body].join('\n');

/** A roster a house would keep: one orchestrator, one leaf, each declaring its tools. */
const CLEAN: Record<string, string> = {
  '.claude/agents/lead.md': definition({
    name: 'lead',
    description: 'Plans and orchestrates.',
    // The ONE role allowed to spawn. Listing it here is a decision about the pipeline's
    // shape, which is why the check asks for the list rather than inferring it.
    tools: 'Read, Grep, Glob, Agent',
    model: 'opus',
  }),
  '.claude/agents/reviewer.md': definition({
    name: 'reviewer',
    description: 'Reads a change and reports what is wrong with it.',
    tools: 'Read, Grep, Glob',
    model: 'sonnet',
  }),
};

/** The same roster with one defect per rule. */
const BROKEN: Record<string, string> = {
  // Omits `tools:` — which does not restrict the agent, it INHERITS the whole session
  // toolset. This is how a read-only reviewer silently gains Write.
  '.claude/agents/lead.md': definition({ name: 'lead', description: 'Plans.', model: 'opus' }),
  // A leaf role that can spawn: a bounded pipeline becomes an unbounded one, and the
  // bill and the blast radius grow together.
  '.claude/agents/reviewer.md': definition({
    name: 'reviewer',
    description: 'Reads a change.',
    tools: 'Read, Agent',
    model: 'sonnet',
  }),
  // `name` disagrees with the filename. An assistant addresses agents by name, so this
  // definition is loaded and then uncallable — the failure looks like a typo at the call
  // site, nowhere near the file that caused it.
  '.claude/agents/qa.md': definition({ name: 'quality', description: 'Checks.', tools: 'Read', model: 'sonnet' }),
  // No frontmatter at all: a document in the agents folder that registers nothing.
  '.claude/agents/notes.md': '# notes\n\nA file somebody left here.\n',
};

describe('@specwarden/agents', () => {
  it('exercises every check factory the package publishes', async () => {
    const mod = (await import('@specwarden/agents')) as Record<string, unknown>;

    expect(uncoveredFactories(mod, { covered: COVERED, probe: PROBE })).toEqual([]);
    // And the probe is one the factory accepts: it refuses an option it does not have, so a
    // probe it refused would read it as a helper and the line above would pass over nothing.
    expect(publishedFactories(mod, PROBE)).toEqual(COVERED);
  });

  it('passes a roster where every role declares its tools and only the orchestrator spawns', async () => {
    // The minimal wiring: `.claude/agents` is the default folder, and the id and rule default too.
    const check = agentDefinitions();

    expect(check.id).toBe('agent-definitions');
    expect((await runCheck(check, { tree: CLEAN })).ok).toBe(true);
  });

  it('names every defect in a broken roster, each by its own file', async () => {
    const check = agentDefinitions();

    const verdict = await runCheck(check, { tree: BROKEN });
    const errors = errorsOf(verdict).join('\n');

    expect(verdict.ok).toBe(false);
    expect(errors).toContain('lead.md: missing or empty `tools:`');
    expect(errors).toContain('not an orchestrator');
    expect(errors).toContain('does not match the filename');
    expect(errors).toContain('no YAML frontmatter');
  });

  it('a roster that is not where `agentsDir` says is a failure naming the folder', async () => {
    // "Nobody runs agents here" is a repository that does not install this module. One that
    // did, and whose roster moved, passed as "nothing to verify" — forever.
    const check = agentDefinitions();

    const verdict = await runCheck(check, { tree: { 'README.md': '# no agents\n' } });
    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)[0]).toMatch(/^examined 0 agent definition\(s\) — `\.claude\/agents` does not exist/);
  });

  it('a folder with no role in it is an empty corpus — a failure, unless declared in writing', async () => {
    const tree = { '.claude/agents/README.txt': 'roles go here\n' };

    expect((await runCheck(agentDefinitions(), { tree })).ok).toBe(false);
    const declared = await runCheck(agentDefinitions({ corpus: { atLeast: 0 } }), { tree });
    expect(declared.ok).toBe(true);
    expect(declared.findings.map((f) => f.message)).toEqual([
      '✓ agent-definitions — 0 agent definition(s) examined, clean',
    ]);
  });

  it('refuses a misspelled, empty or wrong-kind option by name, when the file loads', () => {
    expect(() => agentDefinitions({ agents: '.claude/agents' } as never)).toThrow(CheckOptionsError);
    expect(() => agentDefinitions({ agents: '.claude/agents' } as never)).toThrow(
      '`agents` is not an option of agentDefinitions',
    );
    expect(() => agentDefinitions({ agentsDir: '' })).toThrow('`agentsDir` is empty');
    expect(() => agentDefinitions({ orchestrators: 'lead' } as never)).toThrow('`orchestrators` must be an array');
  });

  it('the orchestrator set is the host’s to decide, not this package’s', async () => {
    const tree = {
      '.claude/agents/planner.md': definition({
        name: 'planner',
        description: 'Plans.',
        tools: 'Read, Agent',
        model: 'opus',
      }),
    };

    expect((await runCheck(agentDefinitions(), { tree })).ok).toBe(false);
    const permitted = agentDefinitions({ orchestrators: ['planner'] });
    expect((await runCheck(permitted, { tree })).ok).toBe(true);
  });

  it('parseFrontmatter reads a folded description as one field', () => {
    // The shape a long description is written in. Read wrong, `description` comes back
    // empty and the check reports a missing field that is plainly there.
    const fields = parseFrontmatter(
      ['---', 'name: lead', 'description: >', '  Plans and', '  orchestrates.', '---', ''].join('\n'),
    );

    expect(fields?.description).toBe('Plans and orchestrates.');
  });
});

// Wired with no `rule`, a module's check was an orphan the moment a register existed —
// and a preset's checks had nowhere to put one. The module knows what its check enforces.
describe('@specwarden/agents — every check names the rule it enforces', () => {
  it('carries an implied rule owned by the package, and a rule the consumer writes wins', () => {
    const built = [agentDefinitions()];
    for (const check of built) {
      expect(check.rule, check.id).toEqual(
        expect.objectContaining({ statement: expect.any(String), owner: '@specwarden/agents', implied: true }),
      );
      expect(check.title, check.id).not.toBe(check.id);
    }
    expect(agentDefinitions({ rule: 'ours' }).rule).toEqual({ statement: 'ours' });
  });
});
