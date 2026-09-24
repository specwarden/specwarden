import { describe, expect, it } from 'vitest';

import { CheckOptionsError, errorsOf, runCheck } from 'specwarden';
import { envPairing } from './env-pairing.check';

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
  runCheck(envPairing({ ...OPTIONS, ...over }), { tree: { 'docker-compose.yml': COMPOSE, ...tree } });

const MISSING =
  'prod: HANDSHAKE_KEY is set in env/prod/edge.env (sent by edge) but missing or empty in env/prod/be.env (verified by be). The verifier boots green and rejects every request carrying it — set it in env/prod/be.env.';

describe('envPairing — the verifier lacks the key the sender has', () => {
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

describe('envPairing — a mounted Caddyfile is read', () => {
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
        "prod: HANDSHAKE_KEY is interpolated by edge's mounted config but is missing or empty in env/prod/edge.env — set it there, or the substitution yields an empty string.",
      ]);
    }
  });
});

describe('envPairing — its options', () => {
  it('refuses an empty `verifierService` where it was written, instead of looking up a service called nothing', () => {
    // A scaffold writes `verifierService: ''` for the consumer to fill in. It was looked up
    // as a service, and then reported at run time; it is a load error now, by name.
    expect(() => envPairing({ ...OPTIONS, verifierService: '' })).toThrow(CheckOptionsError);
    expect(() => envPairing({ ...OPTIONS, verifierService: '' })).toThrow('`verifierService` is empty');
  });

  it('refuses an empty `modes` — it compared no mode and was green', () => {
    expect(() => envPairing({ ...OPTIONS, modes: [] })).toThrow('`modes` is empty');
  });

  it('runs without a `when`, and refuses a missing `declaredKeys` by name', () => {
    expect(envPairing(OPTIONS).when(['anything'])).toBe(true);
    const { declaredKeys: _omitted, ...rest } = OPTIONS;
    expect(() => envPairing(rest as never)).toThrow(CheckOptionsError);
    expect(() => envPairing(rest as never)).toThrow('`declaredKeys` is required');
  });
});

describe('envPairing — one env file loaded by two services', () => {
  it('reads it once, and does not ask the verifier for a key it loads itself', async () => {
    const shared = `services:\n  edge:\n    env_file:\n      - ./env/${MODE}/shared.env\n      - ./env/${MODE}/edge.env\n  be:\n    env_file:\n      - ./env/${MODE}/shared.env\n`;
    const verdict = await run({
      'docker-compose.yml': shared,
      'env/prod/shared.env': 'HANDSHAKE_KEY=abc\n',
      'env/prod/edge.env': 'EDGE_PORT=80\n',
    });

    expect(errorsOf(verdict)).toEqual([]);
  });

  it('names the service header’s line when the verifier is declared with no env_file', async () => {
    const compose = `services:\n  edge:\n    env_file:\n      - ./env/${MODE}/edge.env\n  be:\n    image: be\n`;
    const verdict = await run({ 'docker-compose.yml': compose });

    expect(verdict.findings.find((f) => f.severity === 'error')).toMatchObject({
      file: 'docker-compose.yml',
      line: 5,
      message:
        'docker-compose.yml: service `be` declares no env_file — name in `verifierService` the service that verifies a key another service sends, and give it the env_file it reads.',
    });
  });
});
