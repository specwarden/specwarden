import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { agentDefinitions, parseFrontmatter } from './agent-definitions.check';

const ID = { id: 'agent-definitions', title: 'agents declare tools', tier: 'fast' as const };

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
      '.claude/agents/scout.md: no YAML frontmatter — the harness cannot register this agent.',
    ]);
  });

  it('flags each missing required field', async () => {
    const v = await run({ '.claude/agents/scout.md': fm({ name: 'scout', tools: 'Read' }) });

    expect(errorsOf(v)).toEqual([
      '.claude/agents/scout.md: missing or empty `description:`.',
      '.claude/agents/scout.md: missing or empty `model:`.',
    ]);
  });

  it('treats an EMPTY field as missing — `tools:` with nothing after it inherits everything', async () => {
    const v = await run({ '.claude/agents/scout.md': fm({ ...SCOUT, tools: '' }) });

    expect(errorsOf(v)).toEqual(['.claude/agents/scout.md: missing or empty `tools:`.']);
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

  it('flags a name that does not match the filename — the harness addresses agents by name', async () => {
    const v = await run({ '.claude/agents/scout.md': fm({ ...SCOUT, name: 'explorer' }) });

    expect(errorsOf(v)).toEqual([
      '.claude/agents/scout.md: `name: explorer` does not match the filename (`scout`) — the harness addresses agents by name, so this one is uncallable.',
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
  it('is a vacuous pass when the agents directory is absent, and says so', async () => {
    const v = await run({ 'other/x.md': '' }, { agentsDir: 'nope' });

    expect(v).toEqual({ ok: true, findings: [{ severity: 'info', message: 'no nope, nothing to verify' }] });
  });

  it('treats a FILE at the agents path as no directory', async () => {
    expect((await run({ '.claude/agents': 'not a folder' })).ok).toBe(true);
  });

  it('says it read nothing when the folder holds no definition — a blank pass reads as "all sound"', async () => {
    const v = await run({ '.claude/agents/README.txt': 'roles go here' });

    expect(v).toEqual({
      ok: true,
      findings: [{ severity: 'info', message: 'no agent definition in .claude/agents, nothing to verify' }],
    });
  });
});
