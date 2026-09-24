import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { perimeter } from './perimeter.command';

/**
 * The hook ENTRY: find `.specwarden/perimeter.mjs`, import it, read one payload off
 * stdin, answer 2 (block) or 0 (allow).
 *
 * Two contracts, and both are the whole point. It blocks what a rule names — a
 * perimeter that silently allows because it looked in the wrong folder is a guard
 * that is not there. And it FAILS OPEN on every fault — a perimeter that turns a
 * broken file into a block halts work while wearing the face of a rule.
 *
 * The policies below are plain objects rather than `commandPolicy(...)`: the temp directory
 * is outside the workspace and cannot resolve the engine's package.
 */

const RULE = `{
  id: 'no-rm',
  evaluate: (intent) =>
    intent.command && intent.command.startsWith('rm ')
      ? { blocked: true, reason: 'rm deletes what review cannot see', policyId: 'no-rm' }
      : { blocked: false },
}`;

const RM = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } });
const LS = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } });

describe('perimeter, the PreToolUse entry', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spw-perim-'));
    mkdirSync(join(dir, '.specwarden'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const declare = (body: string, rel = 'perimeter.mjs') => {
    const abs = join(dir, '.specwarden', rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  };

  async function hook(stdin: string | (() => string), cwd = dir) {
    let err = '';
    const code = await perimeter(cwd, typeof stdin === 'function' ? stdin : () => stdin, {
      out: () => {
        throw new Error('the perimeter speaks on stderr only; stdout belongs to the assistant');
      },
      err: (t) => (err += t),
    });
    return { code, err };
  }

  describe('it blocks what a rule names', () => {
    it('reads `export const policies`, blocks with 2 and tells the assistant why', async () => {
      declare(`export const policies = [${RULE}];`);
      const r = await hook(RM);
      expect(r.code).toBe(2);
      expect(r.err).toContain('Blocked by the perimeter: rm deletes what review cannot see');
    });

    it('allows with 0 and says nothing for an action no rule names', async () => {
      declare(`export const policies = [${RULE}];`);
      expect(await hook(LS)).toEqual({ code: 0, err: '' });
    });

    it('reads a default-exported ARRAY of policies', async () => {
      declare(`export default [${RULE}];`);
      expect((await hook(RM)).code).toBe(2);
    });

    it('reads a default-exported object holding the policies', async () => {
      declare(`export default { policies: [${RULE}] };`);
      expect((await hook(RM)).code).toBe(2);
    });

    it('finds the declaration in its own folder, beside its test', async () => {
      // Folder-per-unit is a house style; resolving only the flat file forced such a
      // house to choose between its convention and a perimeter that enforces anything.
      declare(`export const policies = [${RULE}];`, 'perimeter/perimeter.mjs');
      expect((await hook(RM)).code).toBe(2);
    });

    it('walks up from a nested working directory to the repository that declares it', async () => {
      declare(`export const policies = [${RULE}];`);
      const nested = join(dir, 'packages', 'a');
      mkdirSync(nested, { recursive: true });
      expect((await hook(RM, nested)).code).toBe(2);
    });
  });

  describe('a runtime declared beside the policies is the one that speaks', () => {
    const RUNTIME = `{
      name: 'other',
      parse: (p) => (p && p.shell ? { tool: 'shell', command: p.shell } : null),
      exitCode: (v) => (v.blocked ? 7 : 0),
      formatBlock: (v) => 'DENIED ' + v.policyId,
    }`;

    it('as a named export', async () => {
      declare(`export const policies = [${RULE}];\nexport const runtime = ${RUNTIME};`);
      const r = await hook(JSON.stringify({ shell: 'rm -rf /' }));
      expect(r).toEqual({ code: 7, err: 'DENIED no-rm' });
    });

    it('inside a default-exported object', async () => {
      declare(`export default { policies: [${RULE}], runtime: ${RUNTIME} };`);
      const r = await hook(JSON.stringify({ shell: 'rm -rf /' }));
      expect(r).toEqual({ code: 7, err: 'DENIED no-rm' });
    });
  });

  describe('it fails open on every fault', () => {
    it('allows when no perimeter is declared, without even reading stdin', async () => {
      let read = false;
      const r = await hook(() => {
        read = true;
        return RM;
      });
      expect(r).toEqual({ code: 0, err: '' });
      // stdin is the assistant's pipe; draining it for a file that is not there is
      // work with no possible outcome but "allow".
      expect(read).toBe(false);
    });

    it('allows an empty payload', async () => {
      declare(`export const policies = [${RULE}];`);
      expect(await hook('   \n')).toEqual({ code: 0, err: '' });
    });

    it('allows a payload that is not JSON', async () => {
      declare(`export const policies = [${RULE}];`);
      expect(await hook('{ not json')).toEqual({ code: 0, err: '' });
    });

    it('allows when the declaration itself throws on import', async () => {
      declare(`throw new Error('broken perimeter');`);
      expect(await hook(RM)).toEqual({ code: 0, err: '' });
    });

    it('allows when stdin cannot be read', async () => {
      declare(`export const policies = [${RULE}];`);
      const r = await hook(() => {
        throw new Error('EAGAIN');
      });
      expect(r).toEqual({ code: 0, err: '' });
    });

    it('allows when a rule throws, and still lets a later rule block', async () => {
      declare(`export const policies = [{ id: 'boom', evaluate: () => { throw new Error('x'); } }, ${RULE}];`);
      expect((await hook(LS)).code).toBe(0);
      expect((await hook(RM)).code).toBe(2);
    });

    it('allows when the file declares no policies at all', async () => {
      declare(`export const unrelated = 1;`);
      expect(await hook(RM)).toEqual({ code: 0, err: '' });
    });
  });
});
