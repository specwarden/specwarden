import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SpecwardenZoneError, type TZone, assertZoneMatchesLocation } from './zone.model';

const HERE = dirname(fileURLToPath(import.meta.url));
// Two levels up from src/domain/zone/ IS src/. Spelled as a climb rather than as
// `HERE` because this file has moved once already: when it sat in src/ the two were
// the same, and after the move a bare `HERE` would have scanned a single folder and
// reported the barrier clean by scanning almost nothing.
const SRC_ROOT = join(HERE, '..', '..');

/**
 * The host-repository literals a product-zone source may never contain, for a
 * REPRESENTATIVE host: two workspaces, a plans folder, an ORM and two domain nouns —
 * the shapes a host's knowledge takes when it leaks into an engine. The list is
 * hardcoded HERE, in the package's own test, and not read from any config — a
 * boundary that can be relaxed from outside is not a boundary. Each entry is a
 * matcher plus a human label; the path-shaped ones match a fragment, the two domain
 * nouns (`invoice`, `shipment`) match on word boundaries so ordinary prose that
 * merely contains those letters ("invoiced", "reshipments") is not a false positive.
 */
const FORBIDDEN_LITERALS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'backend/ (host workspace)', re: /(^|[^\w])backend\//m },
  { label: 'frontend/ (host workspace)', re: /(^|[^\w])frontend\//m },
  { label: 'docs/_plans (a host’s plans folder)', re: /docs\/_plans/ },
  { label: 'drizzle (a host’s ORM)', re: /\bdrizzle\b/i },
  { label: 'invoice (host domain noun)', re: /\binvoice\b/i },
  { label: 'shipment (host domain noun)', re: /\bshipment\b/i },
];

/** Every `.ts` under src, minus the specs (which legitimately name literals to
 * test against them, as this file does). */
function productSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
    }
  };
  walk(SRC_ROOT);
  return out;
}

function scanForLiterals(source: string): string[] {
  return FORBIDDEN_LITERALS.filter((f) => f.re.test(source)).map((f) => f.label);
}

/**
 * The location-to-zone mapping. It lives HERE and not in the engine because it is
 * a fact about one repository's layout — product code under `core/src/`, consumer
 * checks at `.specwarden/` — and would not survive moving the product anywhere
 * else. That is exactly the "rename the project" test the zone doctrine turns on:
 * knowledge that fails it is consumer/test knowledge, never P.
 */
function zoneForLocation(path: string): TZone | undefined {
  const p = path.replace(/\\/g, '/');
  if (p.includes('core/src/')) return 'product';
  if (p.includes('.specwarden/')) return 'consumer';
  return undefined;
}

describe('zone P source carries no host-repository literals', () => {
  // First: prove the detector CATCHES. A check nobody has seen fail is a hope.
  it('flags a source that reaches into a host workspace or names the host domain', () => {
    expect(scanForLiterals("import { x } from '../../backend/foo';")).toContain('backend/ (host workspace)');
    expect(scanForLiterals('// a drizzle migration lives in backend/drizzle')).toEqual(
      expect.arrayContaining(['drizzle (a host’s ORM)', 'backend/ (host workspace)']),
    );
    expect(scanForLiterals('// this check runs once per shipment, before the invoice closes')).toEqual(
      expect.arrayContaining(['shipment (host domain noun)', 'invoice (host domain noun)']),
    );
  });

  // Second, the half that is skipped more often: it must LET THROUGH the ordinary.
  // camelCase and compound words have no boundary before the token, so a bounded
  // matcher passes them — which is the point: `loadInvoice`, `reshipments`,
  // `mybackend` are not the host's domain nouns or workspaces.
  it('does not flag prose that merely contains the letters', () => {
    expect(scanForLiterals('const m = loadInvoice(); // invoiced reshipments')).toEqual([]);
    expect(scanForLiterals('const dir = mybackend/2; // frontends? no')).toEqual([]);
  });

  // Then the real sweep: every product source is clean.
  it('every src/**/*.ts is clean', () => {
    const offenders = productSources()
      .map((file) => ({ file: relative(SRC_ROOT, file), hits: scanForLiterals(readFileSync(file, 'utf8')) }))
      .filter((r) => r.hits.length > 0);
    expect(offenders, `product sources naming host literals:\n${JSON.stringify(offenders, null, 2)}`).toEqual([]);
  });
});

describe('a declared zone must match the zone its location implies', () => {
  it('rejects a product-zone file tagged consumer', () => {
    expect(() => assertZoneMatchesLocation('consumer', zoneForLocation('core/src/checks/x.ts'), 'x.ts')).toThrow(
      SpecwardenZoneError,
    );
  });

  it('rejects a consumer-zone file tagged product', () => {
    expect(() =>
      assertZoneMatchesLocation('product', zoneForLocation('/repo/.specwarden/checks/y.ts'), 'y.ts'),
    ).toThrow(SpecwardenZoneError);
  });

  it('accepts a matching pair', () => {
    expect(() => assertZoneMatchesLocation('product', zoneForLocation('core/src/zone.ts'))).not.toThrow();
  });

  it('is a no-op where the location implies no zone', () => {
    expect(() => assertZoneMatchesLocation('product', zoneForLocation('/tmp/scratch/z.ts'))).not.toThrow();
  });
});

describe('SpecwardenZoneError says which zones disagree', () => {
  /**
   * The message is the whole diagnostic: the reader has a file and this sentence. It
   * once rendered both zones as empty quotes — "declares zone '' but its location
   * implies ''" — which names the problem and withholds the only two facts needed to
   * fix it.
   */
  it('names the declared zone, the implied zone and the location', () => {
    const error = new SpecwardenZoneError('consumer', 'product', 'core/src/checks/x.ts');

    expect(error.message).toContain("declares zone 'consumer'");
    expect(error.message).toContain("its location implies 'product'");
    expect(error.message).toContain('at core/src/checks/x.ts');
    expect(error.message).not.toContain("''");
    expect(error.message).not.toMatch(/declares declares/);
  });

  it('reads cleanly without a location, rather than printing "at undefined"', () => {
    const error = new SpecwardenZoneError('product', 'consumer');

    expect(error.message.startsWith('zone mismatch: the file declares')).toBe(true);
    expect(error.message).not.toContain('undefined');
  });

  it('carries both zones as fields, so a caller can branch without parsing the text', () => {
    try {
      assertZoneMatchesLocation('product', 'consumer', 'y.ts');
      expect.unreachable('a mismatch passed');
    } catch (error) {
      expect(error).toBeInstanceOf(SpecwardenZoneError);
      expect(error).toMatchObject({
        name: 'SpecwardenZoneError',
        declared: 'product',
        implied: 'consumer',
        location: 'y.ts',
      });
    }
  });
});
