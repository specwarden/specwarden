import type { ICheck, ICorpusFloor, IFinding, IModuleCheckDeclaration } from 'specwarden';
import { belowCorpusFloor, buildCheck, checkOptions, thresholdOf, verdictFrom, withExaminedNote } from 'specwarden';

export interface IAgentDefinitionsOptions extends IModuleCheckDeclaration {
  /** Directory of agent definition files. Default: `.claude/agents`. */
  readonly agentsDir?: string;
  /** Frontmatter fields every definition must carry, non-empty. Default: `name`,
   * `description`, `tools`, `model`. */
  readonly required?: readonly string[];
  /** Tool names that start another agent. Default: `Task`, `Agent`. */
  readonly spawnTools?: readonly string[];
  /** The roles allowed to spawn — adding one is a decision about the pipeline shape.
   * Default: `['lead']`; `[]` forbids delegation entirely. */
  readonly orchestrators?: readonly string[];
  /** How many definitions a run must read. Default: at least 1. */
  readonly corpus?: ICorpusFloor;
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

/** The 1-based line of a frontmatter key, for a finding about it. */
function lineOfKey(source: string, key: string): number | undefined {
  const index = source.split(/\r?\n/).findIndex((line) => line.startsWith(`${key}:`));
  return index === -1 ? undefined : index + 1;
}

/**
 * Every subagent declares its tools, and only an orchestrator may spawn. Omitting
 * `tools:` inherits the whole session toolset — how a read-only reviewer silently
 * gains Write — and a leaf role that can spawn turns a bounded pipeline into an
 * unbounded one, where the bill and the blast radius grow together. Each definition
 * must carry the required fields, its `name` must match its filename (an assistant
 * addresses agents by name), and no spawn tool may appear outside an orchestrator.
 *
 * THE CORPUS IS THE DEFINITIONS. An absent directory, a file where the directory should
 * be, and a folder with no definition in it all passed at some point — "nothing to verify"
 * — and a roster that moved was green forever. Each is below the corpus floor now; a folder made
 * before its first role says `corpus: { atLeast: 0 }`.
 *
 * A PRODUCT check: frontmatter validation and the spawn restriction are universal;
 * the required fields, the spawn-tool names and the orchestrator set are options.
 */
export function agentDefinitions(options: IAgentDefinitionsOptions = {}): ICheck {
  checkOptions('agentDefinitions', options, {
    agentsDir: { kind: 'string', nonEmpty: true },
    required: { kind: 'array', nonEmpty: true },
    spawnTools: { kind: 'array', nonEmpty: true },
    orchestrators: { kind: 'array' },
    corpus: { kind: 'object' },
    zone: { refused: "a module's check speaks for its module, so its zone is `product`" },
  });
  const agentsDir = options.agentsDir ?? '.claude/agents';
  const required = options.required ?? ['name', 'description', 'tools', 'model'];
  const spawnTools = new Set(options.spawnTools ?? ['Task', 'Agent']);
  const orchestrators = new Set(options.orchestrators ?? ['lead']);

  return buildCheck(
    {
      ...options,
      id: options.id ?? 'agent-definitions',
      rule: options.rule ?? {
        statement:
          'every agent definition declares its tools, is named for its file, and only an orchestrator may spawn',
        owner: '@specwarden/agents',
        implied: true,
      },
      zone: 'product',
    },
    ['read'],
    (ctx, self) => {
      const present = ctx.files.exists(agentsDir);
      const isFolder = present && ctx.files.isDirectory(agentsDir);
      const definitions = isFolder ? ctx.files.list(agentsDir).filter((f) => f.endsWith('.md')) : [];
      const floor = belowCorpusFloor(
        self.id,
        definitions.length,
        options.corpus,
        !present
          ? `\`${agentsDir}\` does not exist — point \`agentsDir\` at the folder the agent definitions live in`
          : !isFolder
            ? `\`${agentsDir}\` is a file, not a folder of agent definitions — point \`agentsDir\` at the folder`
            : `\`${agentsDir}\` holds no \`.md\` agent definition`,
        'agent definition',
      );
      if (floor) return floor;

      const findings: IFinding[] = [];
      const fail = (file: string, message: string, line?: number): void => {
        findings.push({ severity: 'error', file, ...(line === undefined ? {} : { line }), message });
      };

      for (const entry of definitions) {
        const rel = `${agentsDir}/${entry}`;
        const source = ctx.files.read(rel);
        const fields = parseFrontmatter(source);
        if (!fields) {
          fail(
            rel,
            `${rel}: no YAML frontmatter — an assistant cannot register this agent. Open the file with \`---\`, its fields, and \`---\`.`,
            1,
          );
          continue;
        }
        for (const field of required) {
          if (!fields[field]) {
            fail(
              rel,
              `${rel}: missing or empty \`${field}:\` — every definition declares it.`,
              lineOfKey(source, field),
            );
          }
        }
        const expected = entry.replace(/\.md$/, '');
        if (fields.name && fields.name !== expected) {
          fail(
            rel,
            `${rel}: \`name: ${fields.name}\` does not match the filename (\`${expected}\`) — an assistant addresses agents by name, so this one is uncallable. Rename one to match the other.`,
            lineOfKey(source, 'name'),
          );
        }
        const tools = (fields.tools || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        const spawn = tools.filter((t) => spawnTools.has(t));
        if (spawn.length && !orchestrators.has(expected)) {
          fail(
            rel,
            `${rel}: declares the spawn tool(s) ${spawn.join(', ')} but is not an orchestrator — a leaf role that can spawn turns a bounded pipeline into an unbounded one. Remove the tool, or name the role in \`orchestrators\`.`,
            lineOfKey(source, 'tools'),
          );
        }
      }
      return verdictFrom(
        withExaminedNote(findings, self.id, definitions.length, 'agent definition'),
        thresholdOf(ctx, self),
      );
    },
  );
}
