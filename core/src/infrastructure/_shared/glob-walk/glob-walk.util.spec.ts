import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readGolden } from '../../_contract/glob/glob-fixture.mjs';
import { walkGlob, type GlobEntry, type GlobTree } from './glob-walk.util';

/**
 * The walk alone, over a tree that is neither the disk nor the map: one that has links,
 * modelled the way the disk has them — `lstat` sees the link, a listing and any path
 * THROUGH it see the target. The disk proves the same cases on win32 junctions and posix
 * symlinks; this proves them without either, so a change to the walk that moves an answer
 * is red here on every machine, in milliseconds.
 *
 * The answers are the golden set's `links` section — what Node 24.21's own `fs.globSync`
 * found in the same tree — through the same file filter the file sources apply.
 */
function linkedTree(files: readonly string[], links: Readonly<Record<string, string>>) {
  const fileSet = new Set(files);
  const dirs = new Set(['']);
  for (const f of files) for (let d = posix.dirname(f); d !== '.'; d = posix.dirname(d)) dirs.add(d);
  for (const l of Object.keys(links)) for (let d = posix.dirname(l); d !== '.'; d = posix.dirname(d)) dirs.add(d);

  const norm = (p: string): string => {
    const n = posix.normalize(p).replace(/\/$/, '');
    return n === '.' ? '' : n;
  };
  /** Where `path` really is: every link on the way followed, the last one only when asked. */
  const real = (path: string, followLast: boolean): string | undefined => {
    const parts = norm(path).split('/').filter(Boolean);
    let at = '';
    for (let i = 0; i < parts.length; i++) {
      at = at ? `${at}/${parts[i]}` : (parts[i] as string);
      for (let hops = 0; links[at] !== undefined && (i < parts.length - 1 || followLast); hops++) {
        if (hops > 40) return undefined; // a loop the OS would call ELOOP
        at = norm(posix.join(posix.dirname(at), links[at] as string));
      }
    }
    return at;
  };
  const tree: GlobTree = {
    stat: (path) => {
      const at = real(path, false);
      if (at === undefined) return undefined;
      if (links[at] !== undefined) return { directory: false, symlink: true };
      if (fileSet.has(at)) return { directory: false, symlink: false };
      return dirs.has(at) ? { directory: true, symlink: false } : undefined;
    },
    list: (path) => {
      const at = real(path, true);
      if (at === undefined || !dirs.has(at)) return [];
      const prefix = at === '' ? '' : `${at}/`;
      const names = new Set<string>();
      for (const p of [...fileSet, ...dirs, ...Object.keys(links)]) {
        if (p !== at && p.startsWith(prefix)) names.add(p.slice(prefix.length).split('/')[0] as string);
      }
      return [...names].map((name): GlobEntry => ({
        name,
        directory: dirs.has(prefix + name),
        symlink: links[prefix + name] !== undefined,
      }));
    },
  };
  const isFile = (path: string): boolean => {
    const at = real(path, true);
    return at !== undefined && fileSet.has(at);
  };
  return { tree, isFile };
}

describe('walkGlob — through links, as Node 24.21 walks them', () => {
  const section = readGolden().sections.links;
  const links = Object.fromEntries(
    (section.tree.links as { path: string; target: string }[]).map((l) => [l.path, l.target]),
  );
  const { tree, isFile } = linkedTree(section.tree.files as string[], links);
  const recorded = section.recorded.linux as Record<string, readonly string[]>;

  it('knows the tree it stands in for — a link that resolved nowhere would make every case vacuous', () => {
    expect(isFile('node_modules/pkg/README.md')).toBe(true);
    expect(isFile('loop/loop/docs/a.md')).toBe(true);
    expect(tree.stat('dangling')).toEqual({ directory: false, symlink: true });
    expect(isFile('dangling/x')).toBe(false);
  });

  it.each(section.patterns as string[])('%s', (pattern) => {
    const files = walkGlob(pattern, tree, { nocase: false, windows: false }).filter(isFile);
    expect([...files].sort()).toEqual(recorded[pattern]);
  });
});
