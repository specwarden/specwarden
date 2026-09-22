import { describe, expect, it } from 'vitest';

import type { ICheckContext, IVerdict } from 'specwarden';
import { InMemoryFileSource } from 'specwarden';
import { agentDefinitions, parseFrontmatter } from './agent-definitions.check';

const ID = { id: 'agent-definitions', title: 'agents declare tools', tier: 'fast' as const };

function run(files: Record<string, string>, opts: Partial<Parameters<typeof agentDefinitions>[0]> = {}): IVerdict {
  const source = new InMemoryFileSource(files);
  const check = agentDefinitions({ ...ID, agentsDir: '.claude/agents', ...opts });
  return check.run({ changed: [], files: source } as unknown as ICheckContext) as IVerdict;
}

const fm = (fields: Record<string, string>) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\nbody\n`;

describe('parseFrontmatter', () => {
  it('reads flat key: value and a folded block', () => {
    const f = parseFrontmatter('---\nname: x\ndescription: >\n  long text\n  more\ntools: Read\n---\n');
    expect(f).toMatchObject({ name: 'x', tools: 'Read', description: 'long text more' });
  });
  it('returns null without frontmatter', () => {
    expect(parseFrontmatter('# just a heading')).toBeNull();
  });
});

describe('agentDefinitions', () => {
  it('is a product-zone check', () => {
    expect(agentDefinitions({ ...ID, agentsDir: 'x' }).zone).toBe('product');
  });

  it('accepts a complete definition whose name matches its file', () => {
    expect(
      run({ '.claude/agents/scout.md': fm({ name: 'scout', description: 'd', tools: 'Read, Grep', model: 'haiku' }) })
        .ok,
    ).toBe(true);
  });

  it('flags a missing required field', () => {
    const v = run({ '.claude/agents/scout.md': fm({ name: 'scout', description: 'd', tools: 'Read' }) }); // no model
    expect(v.ok).toBe(false);
    expect(v.findings.some((f) => f.message.includes('`model:`'))).toBe(true);
  });

  it('flags a name that does not match the filename', () => {
    const v = run({
      '.claude/agents/scout.md': fm({ name: 'explorer', description: 'd', tools: 'Read', model: 'haiku' }),
    });
    expect(v.findings.some((f) => f.message.includes('does not match the filename'))).toBe(true);
  });

  it('flags a spawn tool on a non-orchestrator, allows it on an orchestrator', () => {
    const leaf = run({
      '.claude/agents/scout.md': fm({ name: 'scout', description: 'd', tools: 'Read, Task', model: 'haiku' }),
    });
    expect(leaf.findings.some((f) => f.message.includes('spawn tool'))).toBe(true);
    const lead = run({
      '.claude/agents/lead.md': fm({ name: 'lead', description: 'd', tools: 'Read, Task', model: 'opus' }),
    });
    expect(lead.ok).toBe(true);
  });

  it('is a vacuous pass when the agents directory is absent', () => {
    expect(run({ 'other/x.md': '' }, { agentsDir: 'nope' }).ok).toBe(true);
  });
});
