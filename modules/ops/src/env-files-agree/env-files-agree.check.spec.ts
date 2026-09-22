import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from 'specwarden';
import { envFilesAgree, parseCompose, parseEnvFile } from './env-files-agree.check';

/**
 * Carried from the consumer check this replaced. The case named "the production defect" is
 * the one that happened: the sender had the secret, the verifier did not, both services
 * booted green, and every request carrying it was refused.
 */
const COMPOSE = `services:
  be:
    env_file:
      - be/.env.\${MODE}
  edge:
    env_file:
      - .env.\${MODE}
    volumes:
      - ./edge/config.yml:/etc/edge/config.yml:ro
      - edge-data:/data
`;

const CONFIG_INTERPOLATING = 'auth:\n  secret: ${EDGE_SECRET}\n';

const check = envFilesAgree({
  id: 'env-pairing',
  title: 'env files agree',
  composeFile: 'docker-compose.yml',
  modes: ['prod'],
  verifierService: 'be',
  declaredKeys: () => new Set(['EDGE_SECRET']),
  when: () => true,
});

const runOver = (files: Record<string, string>) => {
  const source = new InMemoryFileSource(
    { 'docker-compose.yml': COMPOSE, 'edge/config.yml': CONFIG_INTERPOLATING, ...files },
    '',
  );
  return check.run({ files: source } as never);
};

const errors = (verdict: { findings: readonly { severity: string; message: string }[] }) =>
  verdict.findings.filter((f) => f.severity === 'error').map((f) => f.message);

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

    expect(services.get('be')?.envFiles).toEqual(['be/.env.${MODE}']);
    expect(services.get('edge')?.mounts).toEqual(['edge/config.yml']);
    // One spelling per file: these strings are map keys, and two spellings of one file
    // would be compared against each other.
    const relative = ['services:', '  a:', '    env_file:', '      - ./x.env'].join('\n');
    expect(parseCompose(relative).get('a')?.envFiles).toEqual(['x.env']);
  });
});

describe('envFilesAgree', () => {
  it('passes when a shared secret is present and equal in both files', () => {
    const verdict = runOver({ '.env.prod': 'EDGE_SECRET=s\n', 'be/.env.prod': 'EDGE_SECRET=s\n' });

    expect(errors(verdict)).toEqual([]);
  });

  it('catches the production defect: the sender has the secret, the verifier does not', () => {
    const verdict = runOver({ '.env.prod': 'EDGE_SECRET=s\n', 'be/.env.prod': 'OTHER=1\n' });

    expect(errors(verdict)[0]).toMatch(/EDGE_SECRET.*verified by be/s);
  });

  it(`treats an empty value in the verifier file like a missing one`, () => {
    const verdict = runOver({ '.env.prod': 'EDGE_SECRET=s\n', 'be/.env.prod': 'EDGE_SECRET=\n' });

    expect(errors(verdict)).toHaveLength(1);
  });

  it('catches two different values for one key', () => {
    const verdict = runOver({ '.env.prod': 'EDGE_SECRET=a\n', 'be/.env.prod': 'EDGE_SECRET=b\n' });

    expect(errors(verdict)[0]).toMatch(/differs between/);
  });

  it('catches a service missing the variable its own mounted config interpolates', () => {
    const verdict = runOver({ '.env.prod': 'OTHER=1\n', 'be/.env.prod': 'EDGE_SECRET=s\n' });

    expect(errors(verdict)[0]).toMatch(/interpolated by edge/);
  });

  /**
   * The honest "cannot tell". Env files are gitignored, so on most checkouts they are
   * simply not there — and a mode reported as clean would be a green nobody earned.
   */
  it('reports a mode whose files are absent as SKIPPED, not as a pass', () => {
    const verdict = runOver({});

    expect(errors(verdict)).toEqual([]);
    expect(verdict.findings.some((f) => f.message.includes('SKIPPED'))).toBe(true);
  });

  it('fails rather than passes when the compose file cannot be read', () => {
    const source = new InMemoryFileSource({}, '');

    const verdict = check.run({ files: source } as never);

    expect(verdict.ok).toBe(false);
    expect(errors(verdict)[0]).toContain('compared nothing');
  });
});
