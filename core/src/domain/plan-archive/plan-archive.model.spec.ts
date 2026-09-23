import { describe, expect, it } from 'vitest';

import { InMemoryFileSource } from '../../infrastructure';
import { ARCHIVE_HEADER_FIELDS, archiveReadiness, missingArchiveHeader, parseHarvest } from './plan-archive.model';

describe('parseHarvest', () => {
  it('reads "what → where" entries and detects bare claims', () => {
    const text = [
      '## Harvest',
      '- the request-scope decision → server/ARCHITECTURE.md',
      '- Harvested: yes',
      '## Next',
      '- not in the section → nowhere.md',
    ].join('\n');
    const h = parseHarvest(text);
    expect(h.present).toBe(true);
    expect(h.entries).toHaveLength(1); // the entry after "## Next" is outside the section
    expect(h.entries[0]).toMatchObject({ what: 'the request-scope decision', where: 'server/ARCHITECTURE.md' });
    expect(h.bareClaims).toHaveLength(1);
  });

  it('reports absence when there is no harvest section', () => {
    expect(parseHarvest('# a plan\nno harvest here').present).toBe(false);
  });
});

/** The header an archive entry carries, complete. */
const HEADER = [
  '**Started:** 2026-09-01',
  '**Finished:** 2026-09-20',
  '**Branch:** feat-x',
  '**Harvested:** the decisions below',
  '**Left open:** nothing',
  '',
].join('\n');

describe('missingArchiveHeader', () => {
  it('names every field a plan does not declare, in the order an entry lists them', () => {
    expect(missingArchiveHeader('# p\n**Branch:** x\n')).toEqual(['Started', 'Finished', 'Harvested', 'Left open']);
    expect(missingArchiveHeader(HEADER)).toEqual([]);
    expect(ARCHIVE_HEADER_FIELDS).toEqual(['Started', 'Finished', 'Branch', 'Harvested', 'Left open']);
  });

  it('does not count a field with nothing after it', () => {
    expect(missingArchiveHeader(HEADER.replace('**Left open:** nothing', '**Left open:**'))).toEqual(['Left open']);
  });
});

describe('archiveReadiness', () => {
  const files = new InMemoryFileSource({ 'server/ARCHITECTURE.md': '# arch', 'AGENTS.md': '# router' });

  it('is ready when every destination resolves and the archive header is complete', () => {
    const r = archiveReadiness(`${HEADER}## Harvest\n- x → server/ARCHITECTURE.md\n- y → AGENTS.md § Rules\n`, files);
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('refuses a plan whose archive header is incomplete, naming the fields and the shape of the lines', () => {
    // It said "ready" over a plan lacking every field, and the plans module's staleness
    // check then refused the archived entry for exactly that — advice that turned red.
    const r = archiveReadiness('**Branch:** feat-x\n## Harvest\n- x → server/ARCHITECTURE.md\n', files);
    expect(r.ready).toBe(false);
    expect(r.reasons).toEqual([
      'the archive header is missing **Started:**, **Finished:**, **Harvested:**, **Left open:** — an archive entry opens with ' +
        '**Started:** … / **Finished:** … / **Branch:** … / **Harvested:** … / **Left open:** …, one per line.',
    ]);
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
