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
const scratch = mkdtempSync(join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '.tmp-generated-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const write = (name: string, body: string) => {
  const abs = join(scratch, name);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return abs;
};

describe('the generated tree actually loads', () => {
  it('every .check.mjs imports and names the id its file promises', async () => {
    for (const file of live()) {
      const abs = write(file.path.replace(/\//g, '-'), file.body);
      const mod = (await import(pathToFileURL(abs).href)) as { check?: { id: string } };
      expect(mod.check, `${file.path} exports no check`).toBeDefined();
      expect(mod.check?.id).toBe(file.path.split('/').pop()?.replace(/\.check\.mjs$/, ''));
    }
  });

  it('the perimeter loads and its rules evaluate an intent', async () => {
    // The perimeter is DATA the engine runs, not prose: if it does not evaluate, the
    // repository has a file that looks like a guard and guards nothing.
    const file = agentic.files(ctx()).find((f) => f.path === 'perimeter.mjs');
    const abs = write('perimeter.mjs', file?.body ?? '');
    const mod = (await import(pathToFileURL(abs).href)) as { rules?: readonly { id: string; evaluate: (i: unknown) => { blocked: boolean } }[] };
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

  it('spells the sizing patterns out in the generated file rather than hiding them in a default', () => {
    // They are English. A repository writing plans in another language has to see
    // exactly what to replace, or the check quietly finds nothing.
    const body = agentic.files(ctx()).find((f) => f.path.includes('plan-shape'))?.body ?? '';
    expect(body).toContain('sizingPatterns');
    expect(body).toContain('story');
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
    expect(body).toMatch(/FAILS OPEN/);
  });

  it('every rule in the perimeter says what to do INSTEAD', () => {
    const body = agentic.files(ctx()).find((f) => f.path === 'perimeter.mjs')?.body ?? '';
    for (const why of ['Push a new commit, or ask the owner', 'discards work that is not yours']) expect(body).toContain(why);
  });
});

describe('every live check and perimeter rule is named by a rule', () => {
  it('so a fresh tree has no orphan', () => {
    const checkIds = live().map((f) => f.path.split('/').pop()?.replace(/\.check\.mjs$/, ''));
    const named = new Set(agentic.rules(ctx()).flatMap((r) => (r.enforcement as { checkIds: readonly string[] }).checkIds));
    for (const id of checkIds) expect(named.has(id as string), `${id} enforces no rule`).toBe(true);
    // ...and the perimeter's own rule ids are enforcers too, which is why the engine
    // takes `otherEnforcerIds`: they resolve against the perimeter file, not the roster.
    expect(named.has('no-force-push')).toBe(true);
  });
});
