import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../infrastructure';
import { archiveReadiness, parseHarvest } from './plan-archive.model';

describe('parseHarvest', () => {
  it('reads "what → where" entries and detects bare claims', () => {
    const text = [
      '## Harvest',
      '- the context-bag decision → be/ARCHITECTURE.md',
      '- Harvested: yes',
      '## Next',
      '- not in the section → nowhere.md',
    ].join('\n');
    const h = parseHarvest(text);
    expect(h.present).toBe(true);
    expect(h.entries).toHaveLength(1); // the entry after "## Next" is outside the section
    expect(h.entries[0]).toMatchObject({ what: 'the context-bag decision', where: 'be/ARCHITECTURE.md' });
    expect(h.bareClaims).toHaveLength(1);
  });

  it('reports absence when there is no harvest section', () => {
    expect(parseHarvest('# a plan\nno harvest here').present).toBe(false);
  });
});

describe('archiveReadiness', () => {
  const files = new InMemoryFileSource({ 'be/ARCHITECTURE.md': '# arch', 'AGENTS.md': '# router' });

  it('is ready when every destination resolves', () => {
    const r = archiveReadiness('## Harvest\n- x → be/ARCHITECTURE.md\n- y → AGENTS.md § Rules\n', files);
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('refuses a bare "harvested: yes"', () => {
    const r = archiveReadiness('## Harvest\n- harvested: yes\n', files);
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => x.includes('not accepted'))).toBe(true);
  });

  it('refuses a missing harvest section', () => {
    const r = archiveReadiness('# a plan\ndone', files);
    expect(r.ready).toBe(false);
    expect(r.reasons[0]).toContain('no Harvest section');
  });

  it('refuses a destination that does not exist', () => {
    const r = archiveReadiness('## Harvest\n- x → docs/gone.md\n', files);
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => x.includes('does not exist'))).toBe(true);
  });

  it('refuses an empty harvest section', () => {
    const r = archiveReadiness('## Harvest\n\n## Next\n', files);
    expect(r.ready).toBe(false);
    expect(r.reasons.some((x) => x.includes('names no'))).toBe(true);
  });
});
