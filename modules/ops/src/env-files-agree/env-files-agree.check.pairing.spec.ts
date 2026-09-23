import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { envFilesAgree } from './env-files-agree.check';

/**
 * The defect this check is named for — the sender has the key, the verifier does not —
 * was only found when the sender's MOUNTED CONFIG interpolated the key. The stack with no
 * mount, the commonest one, was green over exactly that. And a mounted `Caddyfile`, the
 * one proxy config with no extension, was never read for interpolations at all.
 */
const MODE = '$' + '{MODE}';
const COMPOSE = `services:\n  edge:\n    env_file:\n      - ./env/${MODE}/edge.env\n  be:\n    env_file:\n      - ./env/${MODE}/be.env\n`;
const OPTIONS = {
  id: 'env-pairing',
  title: 't',
  composeFile: 'docker-compose.yml',
  modes: ['prod'],
  verifierService: 'be',
  declaredKeys: () => new Set(['HANDSHAKE_KEY']),
};
const run = (tree: Record<string, string>, over: Record<string, unknown> = {}) =>
  runCheck(envFilesAgree({ ...OPTIONS, ...over }), { tree: { 'docker-compose.yml': COMPOSE, ...tree } });

const MISSING =
  'prod: HANDSHAKE_KEY is set in env/prod/edge.env (sent by edge) but missing or empty in env/prod/be.env (verified by be). The verifier boots green and rejects every request carrying it.';

describe('envFilesAgree — the verifier lacks the key the sender has', () => {
  it('is refused with no mounted config at all', async () => {
    const verdict = await run({ 'env/prod/edge.env': 'HANDSHAKE_KEY=abc\n', 'env/prod/be.env': 'BE_PORT=3000\n' });

    expect(errorsOf(verdict)).toEqual([MISSING]);
  });

  it('reports an EMPTY value in the verifier file as missing, not as a differing value', async () => {
    const verdict = await run({ 'env/prod/edge.env': 'HANDSHAKE_KEY=abc\n', 'env/prod/be.env': 'HANDSHAKE_KEY=\n' });

    expect(errorsOf(verdict)).toEqual([MISSING]);
  });

  it('leaves alone a key the application does not declare, and a key the sender leaves empty', async () => {
    const tree = { 'env/prod/edge.env': 'EDGE_PORT=80\nHANDSHAKE_KEY=\n', 'env/prod/be.env': 'BE_PORT=3000\n' };

    expect(errorsOf(await run(tree))).toEqual([]);
  });

  it('passes when both carry the same value', async () => {
    const tree = { 'env/prod/edge.env': 'HANDSHAKE_KEY=abc\n', 'env/prod/be.env': 'HANDSHAKE_KEY=abc\n' };

    expect(errorsOf(await run(tree))).toEqual([]);
  });
});

describe('envFilesAgree — a mounted Caddyfile is read', () => {
  const compose =
    `services:\n  edge:\n    env_file:\n      - ./env/${MODE}/edge.env\n    volumes:\n      - ./caddy/Caddyfile:/etc/caddy/Caddyfile\n` +
    `  be:\n    env_file:\n      - ./env/${MODE}/be.env\n`;

  it('for `{$VAR}`, the placeholder Caddy itself uses, and for `${VAR}`', async () => {
    for (const placeholder of ['{$HANDSHAKE_KEY}', '{$HANDSHAKE_KEY:none}', '$' + '{HANDSHAKE_KEY}']) {
      const verdict = await run({
        'docker-compose.yml': compose,
        'caddy/Caddyfile': `header X-Key ${placeholder}\n`,
        'env/prod/edge.env': 'EDGE_PORT=80\n',
        'env/prod/be.env': 'BE_PORT=3000\n',
      });

      expect(errorsOf(verdict), placeholder).toEqual([
        "prod: HANDSHAKE_KEY is interpolated by edge's mounted config but is missing or empty in env/prod/edge.env.",
      ]);
    }
  });
});

describe('envFilesAgree — its options', () => {
  it('says `verifierService` is not set when it is empty, instead of looking up a service called nothing', async () => {
    const verdict = await run({ 'env/prod/edge.env': 'A=1\n', 'env/prod/be.env': 'A=1\n' }, { verifierService: '' });

    expect(errorsOf(verdict)).toEqual([
      '`verifierService` is not set — name the compose service that VERIFIES a key another service sends.',
    ]);
  });

  it('runs without a `when`, and refuses a missing `declaredKeys` by name', () => {
    expect(envFilesAgree(OPTIONS).when(['anything'])).toBe(true);
    const { declaredKeys: _omitted, ...rest } = OPTIONS;
    expect(() => envFilesAgree(rest as never)).toThrow(CheckOptionsError);
    expect(() => envFilesAgree(rest as never)).toThrow('`declaredKeys` is required');
  });
});
