import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import type { ITemplateContext } from 'specwarden';

import { agentic } from './agentic.template';

const ctx = (over: Partial<ITemplateContext> = {}): ITemplateContext => ({
  docs: '**/*.md',
  tier: 'fast',
  workspaces: [],
  scripts: [],
  composeFiles: [],
  ...over,
});

const paths = (c = ctx()) => agentic.files(c).map((f) => f.path);
const live = (c = ctx()) => agentic.files(c).filter((f) => f.path.endsWith('.check.mjs'));

/** Written inside the package so the generated imports resolve as a consumer's would. */
const scratch = mkdtempSync(
  join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const write = (name: string, body: string) => {
  const abs = join(scratch, name);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return abs;
};

describe('the generated tree actually loads', () => {
  it('every .check.mjs imports, is named by its file, and states the rule it enforces', async () => {
    for (const file of live()) {
      const abs = write(file.path.replace(/\//g, '-'), file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { rule?: { statement: string } } };
      expect(mod.check, `${file.path} exports no check`).toBeDefined();
      // No `id:` — discovery names it after its file, so the two cannot disagree.
      expect(file.body).not.toMatch(/^\s+id: '/m);
      expect(mod.check?.rule?.statement, `${file.path} states no rule`).toBeTruthy();
    }
  });

  it('the perimeter loads and its rules evaluate an intent', async () => {
    // The perimeter is DATA the engine runs, not prose: if it does not evaluate, the
    // repository has a file that looks like a guard and guards nothing.
    const file = agentic.files(ctx()).find((f) => f.path === 'perimeter.mjs');
    const abs = write('perimeter.mjs', file?.body ?? '');
    const mod = (await import(pathToFileURL(abs).href)) as {
      rules?: readonly { id: string; evaluate: (i: unknown) => { blocked: boolean } }[];
    };
    expect(mod.rules?.length).toBe(2);

    const forcePush = mod.rules?.find((r) => r.id === 'no-force-push');
    expect(forcePush?.evaluate({ tool: 'Bash', command: 'git push --force origin main' }).blocked).toBe(true);
    expect(forcePush?.evaluate({ tool: 'Bash', command: 'git push origin main' }).blocked).toBe(false);

    const rewrite = mod.rules?.find((r) => r.id === 'no-history-rewrite-of-a-shared-branch');
    expect(rewrite?.evaluate({ tool: 'Bash', command: 'git reset --hard HEAD~3' }).blocked).toBe(true);
    expect(rewrite?.evaluate({ tool: 'Bash', command: 'git status' }).blocked).toBe(false);
  });
});

describe('it wires what an agentic repository actually needs', () => {
  it('the role files, the docs an agent reads, the plan lifecycle, and a perimeter', () => {
    expect(paths()).toEqual([
      'checks/agents/agent-definitions.check.mjs',
      'checks/docs/doc-paths.check.mjs',
      'checks/plans/plan-staleness.check.mjs',
      'checks/plans/plan-shape.check.mjs',
      'checks/plans/decision-log-shape.check.mjs',
      'perimeter.mjs',
    ]);
  });

  it('covers the whole plan lifecycle, not only the archiving half', () => {
    // Staleness catches a plan that outlived its work. It says nothing about a plan
    // that was never a plan — one that sizes work instead of expressing dependency, or
    // whose phases have no acceptance — and nothing about the decisions inside it,
    // whose rejected alternatives are the facts that exist nowhere else.
    expect(paths()).toContain('checks/plans/plan-shape.check.mjs');
    expect(paths()).toContain('checks/plans/decision-log-shape.check.mjs');
  });

  it('names the options that replace the English defaults, rather than restating the defaults', () => {
    // They are English. A repository writing plans in another language has to see what
    // to replace; the patterns themselves are the module's, one copy, and not forty lines here.
    const body = agentic.files(ctx()).find((f) => f.path.includes('plan-shape'))?.body ?? '';
    for (const option of ['sizingPatterns', 'phaseHeadingRe', 'commandRe']) expect(body).toContain(option);
    expect(body).not.toContain('story');
  });

  it('reads every tracked document — AGENTS.md and CLAUDE.md are what an agent follows first', () => {
    const body = agentic.files(ctx({ docs: 'docs/**/*.md' })).find((f) => f.path.includes('doc-paths'))?.body ?? '';
    expect(body).toContain("docs: '**/*.md'");
    // A finished plan names files as they were; its paths are history, not claims.
    expect(body).toContain("skipDirs: ['docs/_plans-archive/']");
  });

  it('the perimeter ships LIVE, not as an example', () => {
    // Its two rules are the ones nobody disagrees with, and an irreversible action is
    // the one class where "the model usually gets it right" is not good enough.
    expect(paths()).not.toContain('perimeter.mjs.example');
  });

  it('says how to wire the hook, and how to use another assistant', () => {
    const body = agentic.files(ctx()).find((f) => f.path === 'perimeter.mjs')?.body ?? '';
    expect(body).toContain('PreToolUse');
    expect(body).toContain('IAgentRuntime');
    expect(body).toMatch(/fails OPEN/i);
    // …and that until the hook is wired it enforces nothing.
    expect(body).toContain('Nothing is enforced until the hook is wired');
  });

  it('every rule in the perimeter says what to do INSTEAD', () => {
    const body = agentic.files(ctx()).find((f) => f.path === 'perimeter.mjs')?.body ?? '';
    for (const why of ['Push a new commit, or ask the owner', 'discards work that is not yours'])
      expect(body).toContain(why);
  });
});

describe('every rule lives where it can be read', () => {
  it('a live check states its own rule, so the register holds only the perimeter rule', () => {
    // A check with its rule in a register far away is two lists kept in step by memory;
    // on the check, a fresh tree has no orphan by construction.
    expect(agentic.rules(ctx()).map((r) => r.id)).toEqual(['no-irreversible-action-without-a-person']);
    for (const f of live()) expect(f.body, `${f.path} states no rule`).toMatch(/^\s+rule: '/m);
  });

  it('hands init no config fragment — the engine reads the perimeter rule ids as enforcers itself', () => {
    // It used to import perimeter.mjs into the config to list them, a second copy of a
    // list the engine can read.
    expect(agentic.configExtras).toBeUndefined();
  });
});

describe('every rule resolves to something this tree registers', () => {
  it('a check it writes, or a perimeter rule it writes — never a name that resolves to nothing', async () => {
    // The reverse of "no orphan": a rule naming an enforcer nobody registered fails
    // `enforcement-resolves` on the tree the scaffold just wrote.
    const checkIds = new Set(
      live().map((f) =>
        f.path
          .split('/')
          .pop()
          ?.replace(/\.check\.mjs$/, ''),
      ),
    );
    const perimeter = agentic.files(ctx()).find((f) => f.path === 'perimeter.mjs');
    const abs = write('perimeter-ids.mjs', perimeter?.body ?? '');
    const { rules } = (await import(pathToFileURL(abs).href)) as { rules: readonly { id: string }[] };
    const perimeterIds = new Set(rules.map((r) => r.id));

    for (const rule of agentic.rules(ctx())) {
      for (const id of (rule.enforcement as { checkIds: readonly string[] }).checkIds) {
        expect(checkIds.has(id) || perimeterIds.has(id), `rule ${rule.id} names ${id}, which nothing registers`).toBe(
          true,
        );
      }
    }
  });
});
