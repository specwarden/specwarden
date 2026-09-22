import type { ICheck, ICheckIdentity, IFinding } from 'specwarden';
import { buildCheck, verdictFrom } from 'specwarden';

export interface IAgentDefinitionsOptions extends ICheckIdentity {
  /** Directory of agent definition files (`.claude/agents`). */
  readonly agentsDir: string;
  /** Frontmatter fields every definition must carry, non-empty. */
  readonly required?: readonly string[];
  /** Tool names that start another agent. */
  readonly spawnTools?: readonly string[];
  /** The roles allowed to spawn — adding one is a decision about the pipeline shape. */
  readonly orchestrators?: readonly string[];
}

/** Flat `key: value` frontmatter with occasional `>`/`|` folded blocks — no nesting,
 * no lists. Returns the fields, or null when there is no frontmatter. */
export function parseFrontmatter(source: string): Record<string, string> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) return null;
  const fields: Record<string, string> = {};
  let key: string | null = null;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      const value = kv[2].trim();
      fields[key] = value === '>' || value === '|' ? '' : value;
    } else if (key && /^\s+\S/.test(line)) {
      fields[key] = `${fields[key]} ${line.trim()}`.trim();
    }
  }
  return fields;
}

/**
 * Every subagent declares its tools, and only an orchestrator may spawn. Omitting
 * `tools:` inherits the whole session toolset — how a read-only reviewer silently
 * gains Write — and a leaf role that can spawn turns a bounded pipeline into an
 * unbounded one, where the bill and the blast radius grow together. Each definition
 * must carry the required fields, its `name` must match its filename (the harness
 * addresses agents by name), and no spawn tool may appear outside an orchestrator.
 *
 * A PRODUCT check: frontmatter validation and the spawn restriction are universal;
 * the required fields, the spawn-tool names and the orchestrator set are options.
 */
export function agentDefinitions(options: IAgentDefinitionsOptions): ICheck {
  const required = options.required ?? ['name', 'description', 'tools', 'model'];
  const spawnTools = new Set(options.spawnTools ?? ['Task', 'Agent']);
  const orchestrators = new Set(options.orchestrators ?? ['lead']);

  return buildCheck({ ...options, zone: 'product' }, ['read'], (ctx) => {
    const findings: IFinding[] = [];
    // No agent directory is a valid repository state; an empty one is not a violation.
    if (!ctx.files.exists(options.agentsDir) || !ctx.files.isDirectory(options.agentsDir)) {
      return { ok: true, findings: [{ severity: 'info', message: `no ${options.agentsDir}, nothing to verify` }] };
    }

    for (const entry of ctx.files.list(options.agentsDir).filter((f) => f.endsWith('.md'))) {
      const rel = `${options.agentsDir}/${entry}`;
      const fields = parseFrontmatter(ctx.files.read(rel));
      if (!fields) {
        findings.push({ severity: 'error', file: rel, message: `${rel}: no YAML frontmatter — the harness cannot register this agent.`, ruleId: options.id });
        continue;
      }
      for (const field of required) {
        if (!fields[field]) findings.push({ severity: 'error', file: rel, message: `${rel}: missing or empty \`${field}:\`.`, ruleId: options.id });
      }
      const expected = entry.replace(/\.md$/, '');
      if (fields.name && fields.name !== expected) {
        findings.push({ severity: 'error', file: rel, message: `${rel}: \`name: ${fields.name}\` does not match the filename (\`${expected}\`) — the harness addresses agents by name, so this one is uncallable.`, ruleId: options.id });
      }
      const tools = (fields.tools || '').split(',').map((t) => t.trim()).filter(Boolean);
      const spawn = tools.filter((t) => spawnTools.has(t));
      if (spawn.length && !orchestrators.has(expected)) {
        findings.push({ severity: 'error', file: rel, message: `${rel}: declares the spawn tool(s) ${spawn.join(', ')} but is not an orchestrator — a leaf role that can spawn turns a bounded pipeline into an unbounded one.`, ruleId: options.id });
      }
    }
    return verdictFrom(findings, 0);
  });
}
