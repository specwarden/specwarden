import { describe, expect, it } from 'vitest';

import { ALLOW, type IActionIntent } from '../../../domain';
import { commandPolicy, writePolicy } from './command-policy.factory';

/**
 * A perimeter policy is data plus one predicate; the factory supplies the parsing and
 * the block message. The message is what the agent reads INSTEAD of its action, so
 * it is asserted verbatim: a block that does not say which policy and where it is
 * written invites a retry, or a search for a way around.
 */
const bash = (command: string): IActionIntent => ({ tool: 'Bash', command, args: { command } });
const write = (writePath: string): IActionIntent => ({ tool: 'Write', writePath, args: { file_path: writePath } });

const noForcePush = (meta: { owner?: string; why?: string } = {}) =>
  commandPolicy({
    id: 'no-force-push',
    ...meta,
    match: (words) =>
      words[0] === 'git' && words[1] === 'push' && words.includes('--force') ? 'git push --force' : null,
  });

describe('commandPolicy', () => {
  it('blocks a matching command, naming the hit, the policy and its owner', () => {
    const verdict = noForcePush({ owner: 'skills/git/SKILL.md' }).evaluate(bash('git push --force origin dev'));

    expect(verdict).toEqual({
      blocked: true,
      policyId: 'no-force-push',
      reason: 'git push --force — policy no-force-push, owner skills/git/SKILL.md',
    });
  });

  it('appends the reason WHY when the policy states one', () => {
    const verdict = noForcePush({ owner: 'o.md', why: 'History others built on would vanish' }).evaluate(
      bash('git push --force'),
    );

    expect(verdict.reason).toBe(
      'git push --force — policy no-force-push, owner o.md. History others built on would vanish',
    );
  });

  it('still names the policy when it declares no owner', () => {
    expect(noForcePush().evaluate(bash('git push --force')).reason).toBe('git push --force — policy no-force-push');
  });

  it('examines every segment of a chain, not only the first word of the line', () => {
    expect(noForcePush().evaluate(bash('cd repo && git push --force')).blocked).toBe(true);
    expect(noForcePush().evaluate(bash('echo ok; MODE=x git push --force')).blocked).toBe(true);
  });

  it('allows a command that does not match', () => {
    expect(noForcePush().evaluate(bash('git push origin feature'))).toBe(ALLOW);
  });

  /**
   * The policy reads SEMANTICS: an action with no command is not a shell call, whatever
   * the tool is named. Matching on the tool name instead would miss a runtime that
   * calls its shell something else.
   */
  it('allows an action that carries no command, whatever its tool is called', () => {
    expect(noForcePush().evaluate({ tool: 'Bash', args: {} })).toBe(ALLOW);
    expect(noForcePush().evaluate(write('src/a.ts'))).toBe(ALLOW);
  });

  it('allows an empty command rather than handing the predicate nothing to read', () => {
    let called = false;
    const policy = commandPolicy({ id: 'r', match: () => ((called = true), 'hit') });

    expect(policy.evaluate(bash('   '))).toBe(ALLOW);
    expect(called).toBe(false);
  });
});

describe('writePolicy', () => {
  const noGeneratedEdits = writePolicy({
    id: 'generated-is-generated',
    owner: 'skills/structure/SKILL.md',
    why: 'Regenerate it instead',
    match: (path) => (path.endsWith('.generated.json') ? path : null),
  });

  it('blocks a write to a matching path, with the full reason', () => {
    expect(noGeneratedEdits.evaluate(write('db/meta.generated.json'))).toEqual({
      blocked: true,
      policyId: 'generated-is-generated',
      reason:
        'db/meta.generated.json — policy generated-is-generated, owner skills/structure/SKILL.md. Regenerate it instead',
    });
  });

  it('allows a write elsewhere, and any action that writes nothing', () => {
    expect(noGeneratedEdits.evaluate(write('db/schema.ts'))).toBe(ALLOW);
    expect(noGeneratedEdits.evaluate(bash('cat db/meta.generated.json'))).toBe(ALLOW);
  });
});
