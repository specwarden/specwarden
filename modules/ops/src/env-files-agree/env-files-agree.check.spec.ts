import { describe, expect, it } from 'vitest';

import { type IVerdict, errorsOf, runCheck } from 'specwarden';
import { type IEnvFilesAgreeOptions, envFilesAgree, parseCompose, parseEnvFile } from './env-files-agree.check';

/**
 * The case named "the sender has the secret, the verifier does not" is the shape this
 * check exists for: both services boot green, and every request carrying the value is
 * refused.
 */
const COMPOSE = `services:
  api:
    env_file:
      - api/.env.\${MODE}
  edge:
    env_file:
      - .env.\${MODE}
    volumes:
      - ./edge/config.yml:/etc/edge/config.yml:ro
      - edge-data:/data
`;

const CONFIG_INTERPOLATING = 'auth:\n  secret: ${EDGE_SECRET}\n';

const OPTIONS: IEnvFilesAgreeOptions = {
  id: 'env-pairing',
  title: 'env files agree',
  composeFile: 'docker-compose.yml',
  modes: ['prod'],
  verifierService: 'api',
  declaredKeys: () => new Set(['EDGE_SECRET']),
  when: () => true,
};

const runOver = (files: Record<string, string>, over: Partial<IEnvFilesAgreeOptions> = {}): Promise<IVerdict> =>
  runCheck(envFilesAgree({ ...OPTIONS, ...over }), {
    tree: { 'docker-compose.yml': COMPOSE, 'edge/config.yml': CONFIG_INTERPOLATING, ...files },
  });

const notes = (verdict: IVerdict) => verdict.findings.filter((f) => f.severity === 'info').map((f) => f.message);

describe('parseEnvFile', () => {
  it('strips quotes and an export prefix before comparison', () => {
    const entries = parseEnvFile('export A="x"\nB=\'x\'\nC=x\n');

    expect([...entries.values()]).toEqual(['x', 'x', 'x']);
  });

  it('drops a trailing CR, so a CRLF file pairs with an LF one', () => {
    expect(parseEnvFile('A=x\r\n').get('A')).toBe('x');
  });

  it('judges a duplicate key by its LAST occurrence, as a loader does', () => {
    expect(parseEnvFile('A=first\nA=second\n').get('A')).toBe('second');
  });

  it('ignores comments and blank lines', () => {
    expect(parseEnvFile('# A=x\n\nB=y\n').size).toBe(1);
  });
});

describe('parseCompose', () => {
  it('keeps env_file and volume entries apart, drops named volumes, and normalises ./', () => {
    const services = parseCompose(COMPOSE);

    expect(services.get('api')?.envFiles).toEqual(['api/.env.${MODE}']);
    expect(services.get('edge')?.mounts).toEqual(['edge/config.yml']);
    // One spelling per file: these strings are map keys, and two spellings of one file
    // would be compared against each other.
    const relative = ['services:', '  a:', '    env_file:', '      - ./x.env'].join('\n');
    expect(parseCompose(relative).get('a')?.envFiles).toEqual(['x.env']);
  });

  it('reads the inline `env_file: path` form', () => {
    const inline = ['services:', '  a:', '    env_file: a/.env.${MODE}'].join('\n');

    expect(parseCompose(inline).get('a')?.envFiles).toEqual(['a/.env.${MODE}']);
  });

  it('ends a list at the next service key, so a later list item is not read as an env file', () => {
    // `ports:` resets the section; without that, `- 3000:3000` would land in env_file.
    const text = ['services:', '  a:', '    env_file:', '      - a.env', '    ports:', '      - 3000:3000'].join('\n');

    expect(parseCompose(text).get('a')?.envFiles).toEqual(['a.env']);
  });

  it('stops at the end of the services block', () => {
    const text = ['services:', '  a:', '    env_file:', '      - a.env', 'volumes:', '  data:'].join('\n');

    expect([...parseCompose(text).keys()]).toEqual(['a']);
  });

  it('answers no services for a file with no services block', () => {
    expect(parseCompose('version: "3"\n').size).toBe(0);
  });
});

describe('envFilesAgree — the named rules', () => {
  it('is a product-zone, read-only check', () => {
    expect(envFilesAgree(OPTIONS)).toMatchObject({ zone: 'product', capabilities: ['read'], tier: 'fast' });
  });

  it('passes when a shared secret is present and equal in both files, and says what it compared', async () => {
    const verdict = await runOver({ '.env.prod': 'EDGE_SECRET=s\n', 'api/.env.prod': 'EDGE_SECRET=s\n' });

    expect(verdict.ok).toBe(true);
    expect(notes(verdict)).toEqual(['prod: checked 2 env files — api/.env.prod, .env.prod']);
  });

  it('catches the sender having the secret while the verifier does not', async () => {
    const verdict = await runOver({ '.env.prod': 'EDGE_SECRET=s\n', 'api/.env.prod': 'OTHER=1\n' });

    expect(errorsOf(verdict)).toEqual([
      'prod: EDGE_SECRET is set in .env.prod (sent by edge) but missing or empty in api/.env.prod (verified by api). The verifier boots green and rejects every request carrying it.',
    ]);
  });

  it('treats an empty value in the verifier file like a missing one', async () => {
    const verdict = await runOver({ '.env.prod': 'EDGE_SECRET=s\n', 'api/.env.prod': 'EDGE_SECRET=\n' });

    expect(errorsOf(verdict)).toHaveLength(1);
  });

  it('catches a service missing the variable its own mounted config interpolates', async () => {
    const verdict = await runOver({ '.env.prod': 'OTHER=1\n', 'api/.env.prod': 'EDGE_SECRET=s\n' });

    expect(errorsOf(verdict)).toEqual([
      "prod: EDGE_SECRET is interpolated by edge's mounted config but is missing or empty in .env.prod.",
    ]);
  });

  it('does not demand an UNDECLARED key of the verifier — only the application’s keys are sent', async () => {
    const verdict = await runOver(
      { '.env.prod': 'EDGE_SECRET=s\n', 'api/.env.prod': 'OTHER=1\n' },
      { declaredKeys: () => new Set() },
    );

    expect(verdict.ok).toBe(true);
  });

  it('asks the application which keys it declares, through the file port', async () => {
    const declaredKeys = (read: (path: string) => string | undefined) =>
      new Set((read('env.keys') ?? '').split('\n').filter(Boolean));
    const verdict = await runOver(
      { 'env.keys': 'EDGE_SECRET\n', '.env.prod': 'EDGE_SECRET=s\n', 'api/.env.prod': 'OTHER=1\n' },
      { declaredKeys },
    );

    expect(verdict.ok).toBe(false);
  });

  it('does not compare the verifier against itself when it is the service interpolating', async () => {
    // The verifier's own config reading its own key is not a handshake.
    const verdict = await runCheck(envFilesAgree({ ...OPTIONS, verifierService: 'edge' }), {
      tree: {
        'docker-compose.yml': COMPOSE,
        'edge/config.yml': CONFIG_INTERPOLATING,
        '.env.prod': 'EDGE_SECRET=s\n',
        'api/.env.prod': 'OTHER=1\n',
      },
    });

    expect(verdict.ok).toBe(true);
  });

  it('reads only config-shaped mounts, and skips one it cannot read', async () => {
    const compose = COMPOSE.replace(
      '      - edge-data:/data',
      '      - ./edge/run.sh:/run.sh\n      - ./edge/absent.yml:/etc/absent.yml',
    );
    const verdict = await runCheck(envFilesAgree(OPTIONS), {
      tree: {
        'docker-compose.yml': compose,
        'edge/config.yml': 'nothing interpolated',
        'edge/run.sh': 'echo ${EDGE_SECRET}',
        '.env.prod': 'A=1\n',
        'api/.env.prod': 'A=1\n',
      },
    });

    // The shell script names the key but is not a mounted CONFIG; nothing else interpolates.
    expect(verdict.ok).toBe(true);
  });
});

describe('envFilesAgree — a file it cannot see is not a verdict', () => {
  it('asks nothing of a service with no env file, one whose file is absent, or a verifier whose file is absent', async () => {
    // Env files are gitignored: an absent one is "cannot tell", and a guess would fail a
    // checkout for a file that lives on another machine.
    const compose = `services:
  api:
    env_file:
      - api/.env.\${MODE}
  edge:
    env_file:
      - .env.\${MODE}
    volumes:
      - ./edge/config.yml:/etc/edge/config.yml:ro
  proxy:
    volumes:
      - ./proxy/config.yml:/etc/proxy.yml
  worker:
    env_file:
      - worker/.env.\${MODE}
    volumes:
      - ./worker/config.yml:/etc/worker.yml
  jobs:
    env_file:
      - jobs/.env.\${MODE}
`;
    const verdict = await runCheck(envFilesAgree(OPTIONS), {
      tree: {
        'docker-compose.yml': compose,
        'edge/config.yml': CONFIG_INTERPOLATING,
        'proxy/config.yml': CONFIG_INTERPOLATING,
        'worker/config.yml': CONFIG_INTERPOLATING,
        '.env.prod': 'EDGE_SECRET=s\n',
        'jobs/.env.prod': 'OTHER=1\n',
      },
    });

    expect(verdict.ok).toBe(true);
    expect(notes(verdict)).toEqual(['prod: checked 2 env files — .env.prod, jobs/.env.prod']);
  });
});

describe('envFilesAgree — the generic comparison', () => {
  it('catches two different values for one key', async () => {
    const verdict = await runOver({ '.env.prod': 'EDGE_SECRET=a\n', 'api/.env.prod': 'EDGE_SECRET=b\n' });

    expect(errorsOf(verdict)[0]).toMatch(/EDGE_SECRET differs between api\/\.env\.prod and \.env\.prod/);
  });

  it('reports a key once — the named rule that explained it is not repeated by the generic one', async () => {
    const verdict = await runOver({ '.env.prod': 'EDGE_SECRET=s\n', 'api/.env.prod': 'EDGE_SECRET=\n' });

    expect(errorsOf(verdict).filter((m) => m.includes('differs'))).toEqual([]);
  });

  it('compares every mode it is given, substituting each occurrence of the mode', async () => {
    const compose = [
      'services:',
      '  api:',
      '    env_file:',
      '      - ${MODE}/.env.${MODE}',
      '  edge:',
      '    env_file:',
      '      - edge/.env.${MODE}',
    ].join('\n');
    const verdict = await runCheck(envFilesAgree({ ...OPTIONS, modes: ['dev', 'prod'], verifierService: 'api' }), {
      tree: {
        'docker-compose.yml': compose,
        'dev/.env.dev': 'A=1\n',
        'edge/.env.dev': 'A=2\n',
        'prod/.env.prod': 'A=1\n',
        'edge/.env.prod': 'A=1\n',
      },
    });

    // `${MODE}/.env.${MODE}` once resolved to `dev/.env.${MODE}` — only the first
    // occurrence replaced — so the mode was SKIPPED over files that were there.
    expect(errorsOf(verdict)).toEqual([
      'dev: A differs between dev/.env.dev and edge/.env.dev. One stack loads both files; whichever service reads the stale value fails against the other.',
    ]);
    expect(notes(verdict)).toContain('prod: checked 2 env files — prod/.env.prod, edge/.env.prod');
  });
});

describe('envFilesAgree — what it could see', () => {
  /**
   * The honest "cannot tell". Env files are gitignored, so on most checkouts they are
   * simply not there — and a mode reported as clean would be a green nobody earned.
   */
  it('reports a mode whose files are absent as SKIPPED, not as a pass', async () => {
    const verdict = await runOver({});

    expect(errorsOf(verdict)).toEqual([]);
    expect(notes(verdict)).toEqual([
      "prod: SKIPPED — 0 of the mode's env files exist here (they are gitignored; this rule can only run where they live).",
    ]);
  });

  it('skips a mode with only ONE of its files — there is nothing to compare it with', async () => {
    const verdict = await runOver({ '.env.prod': 'EDGE_SECRET=s\n' });

    expect(notes(verdict)[0]).toContain('prod: SKIPPED — 1 of');
  });

  it('fails rather than passes when the compose file cannot be read', async () => {
    const verdict = await runCheck(envFilesAgree(OPTIONS), { tree: {} });

    expect(verdict.ok).toBe(false);
    expect(errorsOf(verdict)).toEqual(['docker-compose.yml cannot be read — this check compared nothing']);
  });

  it('fails when the verifier service declares no env file — the handshake has nothing to check against', async () => {
    const verdict = await runOver({}, { verifierService: 'worker' });

    expect(errorsOf(verdict)).toEqual(['docker-compose.yml: service `worker` declares no env_file.']);
  });
});
