import { describe, expect, it } from 'vitest';

import { CheckOptionsError, type IVerdict, errorsOf, runCheck } from 'specwarden';
import { agentDefinitions, parseFrontmatter } from './agent-definitions.check';

const ID = { title: 'agents declare tools' };

const run = (
  tree: Record<string, string>,
  opts: Partial<Parameters<typeof agentDefinitions>[0]> = {},
): Promise<IVerdict> => runCheck(agentDefinitions({ ...ID, agentsDir: '.claude/agents', ...opts }), { tree });

const fm = (fields: Record<string, string>) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\nbody\n`;

const SCOUT = { name: 'scout', description: 'd', tools: 'Read, Grep', model: 'haiku' };

describe('parseFrontmatter', () => {
  it('reads flat key: value and a folded block', () => {
    const f = parseFrontmatter('---\nname: x\ndescription: >\n  long text\n  more\ntools: Read\n---\n');

    expect(f).toMatchObject({ name: 'x', tools: 'Read', description: 'long text more' });
  });

  it('reads a CRLF file — a definition saved on Windows is not "no frontmatter"', () => {
    expect(parseFrontmatter('---\r\nname: x\r\ntools: Read\r\n---\r\nbody')).toEqual({ name: 'x', tools: 'Read' });
  });

  it('keeps a literal block (`|`) as its text', () => {
    expect(parseFrontmatter('---\ndescription: |\n  line one\n---\n')?.description).toBe('line one');
  });

  it('ignores an indented line before any key', () => {
    expect(parseFrontmatter('---\n  stray\nname: x\n---\n')).toEqual({ name: 'x' });
  });

  it('returns null without frontmatter', () => {
    expect(parseFrontmatter('# just a heading')).toBeNull();
  });
});

describe('agentDefinitions — the definition', () => {
  it('is a product-zone check', () => {
    expect(agentDefinitions({ ...ID, agentsDir: 'x' }).zone).toBe('product');
  });

  it('accepts a complete definition whose name matches its file', async () => {
    expect((await run({ '.claude/agents/scout.md': fm(SCOUT) })).ok).toBe(true);
  });

  it('fails a file with no frontmatter — it loads as no role at all, silently', async () => {
    const v = await run({ '.claude/agents/scout.md': '# Scout\nreads things' });

    expect(errorsOf(v)).toEqual([
      '.claude/agents/scout.md: no YAML frontmatter — an assistant cannot register this agent. Open the file with `---`, its fields, and `---`.',
    ]);
  });

  it('flags each missing required field', async () => {
    const v = await run({ '.claude/agents/scout.md': fm({ name: 'scout', tools: 'Read' }) });

    expect(errorsOf(v)).toEqual([
      '.claude/agents/scout.md: missing or empty `description:` — every definition declares it.',
      '.claude/agents/scout.md: missing or empty `model:` — every definition declares it.',
    ]);
  });

  it('treats an EMPTY field as missing — `tools:` with nothing after it inherits everything', async () => {
    const v = await run({ '.claude/agents/scout.md': fm({ ...SCOUT, tools: '' }) });

    expect(errorsOf(v)).toEqual(['.claude/agents/scout.md: missing or empty `tools:` — every definition declares it.']);
    // …on the line that says it.
    expect(v.findings.find((x) => x.severity === 'error')).toMatchObject({ file: '.claude/agents/scout.md', line: 4 });
  });

  it('takes the required fields a house chooses', async () => {
    const v = await run(
      { '.claude/agents/scout.md': fm({ name: 'scout', description: 'd' }) },
      {
        required: ['name', 'description'],
      },
    );

    expect(v.ok).toBe(true);
  });

  it('flags a name that does not match the filename — an assistant addresses agents by name', async () => {
    const v = await run({ '.claude/agents/scout.md': fm({ ...SCOUT, name: 'explorer' }) });

    expect(errorsOf(v)).toEqual([
      '.claude/agents/scout.md: `name: explorer` does not match the filename (`scout`) — an assistant addresses agents by name, so this one is uncallable. Rename one to match the other.',
    ]);
  });

  it('reads only markdown files as definitions', async () => {
    expect((await run({ '.claude/agents/scout.md': fm(SCOUT), '.claude/agents/notes.txt': 'no frontmatter' })).ok).toBe(
      true,
    );
  });
});

describe('agentDefinitions — who may spawn', () => {
  it('flags a spawn tool on a non-orchestrator, allows it on an orchestrator', async () => {
    const leaf = await run({ '.claude/agents/scout.md': fm({ ...SCOUT, tools: 'Read, Task' }) });
    expect(errorsOf(leaf)[0]).toContain('declares the spawn tool(s) Task but is not an orchestrator');

    const lead = await run({ '.claude/agents/lead.md': fm({ ...SCOUT, name: 'lead', tools: 'Read, Task' }) });
    expect(lead.ok).toBe(true);
  });

  it('takes the house’s own spawn tools and orchestrators', async () => {
    const tree = { '.claude/agents/planner.md': fm({ ...SCOUT, name: 'planner', tools: 'Read, Delegate' }) };

    expect((await run(tree, { spawnTools: ['Delegate'] })).ok).toBe(false);
    expect((await run(tree, { spawnTools: ['Delegate'], orchestrators: ['planner'] })).ok).toBe(true);
  });
});

describe('agentDefinitions — what it examined', () => {
  it('fails over an agents directory that is not there, naming it — it was a vacuous pass', async () => {
    // A roster that moved, or a skill's `agents:` for `agentsDir`, read as "nobody runs
    // agents here" and passed forever.
    const v = await run({ 'other/x.md': '' }, { agentsDir: 'nope' });

    expect(v.ok).toBe(false);
    expect(errorsOf(v)).toHaveLength(1);
    expect(errorsOf(v)[0]).toContain(
      'examined 0 agent definition(s) — `nope` does not exist — point `agentsDir` at the folder the agent definitions live in — below the floor of 1.',
    );
  });

  it('fails a FILE at the agents path, rather than crashing on the listing', async () => {
    expect(errorsOf(await run({ '.claude/agents': 'not a folder' }))[0]).toContain(
      '`.claude/agents` is a file, not a folder of agent definitions — point `agentsDir` at the folder',
    );
  });

  it('reads `.claude/agents` in the fast tier when neither is said', async () => {
    const check = agentDefinitions();
    const tree = { '.claude/agents/lead.md': fm({ name: 'lead', description: 'd', model: 'opus' }) };

    expect(check.tier).toBe('fast');
    expect(check.id).toBe('agent-definitions');
    expect(errorsOf(await runCheck(check, { tree }))).toEqual([
      '.claude/agents/lead.md: missing or empty `tools:` — every definition declares it.',
    ]);
  });

  it('refuses the skill’s `agents:` by name when the file loads — it crashed inside a Node path call', () => {
    const skill = { ...ID, id: 'agent-definitions', agents: '.claude/agents/*.md', orchestrators: ['lead'] } as never;

    expect(() => agentDefinitions(skill)).toThrow(CheckOptionsError);
    expect(() => agentDefinitions(skill)).toThrow("agentDefinitions 'agent-definitions': `agents` is not an option");
  });

  it('fails a folder that holds no definition — unless the empty folder is declared, in writing', async () => {
    // It passed with "nothing to verify": a roster emptied by a bad move read as "all sound".
    const v = await run({ '.claude/agents/README.txt': 'roles go here' });
    expect(v.ok).toBe(false);
    expect(errorsOf(v)[0]).toContain('`.claude/agents` holds no `.md` agent definition');

    const declared = await run({ '.claude/agents/README.txt': 'roles go here' }, { corpus: { atLeast: 0 } });
    expect(declared.ok).toBe(true);
    expect(declared.findings.map((x) => x.message)).toEqual([
      '✓ agent-definitions — 0 agent definition(s) examined, clean',
    ]);
  });

  it('prints the engine’s pass line over a sound roster', async () => {
    const v = await run({ '.claude/agents/scout.md': fm(SCOUT) });

    expect(v.findings.map((x) => x.message)).toEqual(['✓ agent-definitions — 1 agent definition(s) examined, clean']);
  });
});

describe('agentDefinitions — the engine’s ratchet, and its options', () => {
  it('honours `ratchet` and the stored threshold — it accepted one and dropped it', async () => {
    const tree = { '.claude/agents/scout.md': fm({ ...SCOUT, tools: '' }) };

    expect((await run(tree, { ratchet: 1 })).ok).toBe(true);
    expect((await runCheck(agentDefinitions({ ratchet: 1 }), { tree, threshold: 0 })).ok).toBe(false);
  });

  it('refuses an empty `required` or `spawnTools`, and `zone`; an empty `orchestrators` forbids delegation', async () => {
    expect(() => agentDefinitions({ required: [] })).toThrow('`required` is empty');
    expect(() => agentDefinitions({ spawnTools: [] })).toThrow('`spawnTools` is empty');
    expect(() => agentDefinitions({ zone: 'consumer' } as never)).toThrow(
      '`zone` is not an option of agentDefinitions',
    );
    const lead = { '.claude/agents/lead.md': fm({ ...SCOUT, name: 'lead', tools: 'Read, Task' }) };
    expect((await run(lead, { orchestrators: [] })).ok).toBe(false);
  });
});
