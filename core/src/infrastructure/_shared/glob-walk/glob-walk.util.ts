import { posix } from 'node:path';

import {
  compileGlob,
  GLOBSTAR,
  type CompiledGlob,
  type GlobOptions,
  type GlobSegment,
} from '../glob-pattern/glob-pattern.util';

/** What a walk needs to know about one entry: `lstat`, never following a link. */
export interface GlobStat {
  readonly directory: boolean;
  readonly symlink: boolean;
}

export interface GlobEntry extends GlobStat {
  readonly name: string;
}

/**
 * The tree a glob walks. Paths are the walk's own — `.`, `docs/sub`, `../x`, `/abs` —
 * forward-slashed; the tree resolves them against whatever it is rooted at. Two trees
 * exist, the disk and the in-memory map, and they share this walk so that the file
 * source and its fake cannot disagree about what a pattern reaches.
 */
export interface GlobTree {
  /** The entry at `path`, or undefined when there is none. */
  stat(path: string): GlobStat | undefined;
  /** The entries of the directory at `path`; none when it cannot be read. */
  list(path: string): readonly GlobEntry[];
}

/**
 * Every path `pattern` matches in `tree` — directories included, as `fs.globSync`
 * returns them; the file sources keep only the files.
 *
 * The walk is Node 24's own (`lib/internal/fs/glob.js`), restated: a set of candidate
 * segment indexes travels down the tree, a literal segment is looked up rather than
 * listed, `**` descends into every directory that is neither a dot directory nor
 * reached through a symlink, and a dot directory is entered only when the segment after
 * the `**` names it. The ORDER is Node's too — a stack of directories, each round
 * pushing what it found — because Node skips a directory it has already visited with any
 * of the same remaining patterns, and which visit comes first decides what that skip
 * hides.
 */
export function walkGlob(pattern: string, tree: GlobTree, options: GlobOptions): readonly string[] {
  return new Walk(tree, options.windows).run(compileGlob(pattern, options));
}

interface State {
  readonly glob: CompiledGlob;
  readonly indexes: ReadonlySet<number>;
  /** Indexes reached through a symlink: `**` does not descend any further from them. */
  readonly symlinks: ReadonlySet<number>;
}

const { join } = posix;

class Walk {
  private readonly results = new Set<string>();
  private readonly visited = new Map<string, Set<string>>();
  private pending = new Map<string, State[]>();
  private readonly tree: GlobTree;

  constructor(
    source: GlobTree,
    private readonly windows: boolean,
  ) {
    this.tree = memoised(source);
  }

  run(globs: readonly CompiledGlob[]): readonly string[] {
    const queue: { path: string; states: readonly State[] }[] = [
      { path: '.', states: globs.map((glob) => ({ glob, indexes: new Set([0]), symlinks: new Set<number>() })) },
    ];
    for (let item = queue.pop(); item; item = queue.pop()) {
      for (const state of item.states) this.visit(item.path, state);
      for (const [path, states] of this.pending) queue.push({ path, states });
      this.pending = new Map();
    }
    return [...this.results];
  }

  private schedule(path: string, state: State): void {
    const states = this.pending.get(path);
    if (states) states.push(state);
    else this.pending.set(path, [state]);
  }

  /** The rest of the pattern from `index`, which is what makes two visits the same. */
  private static key(state: State, index: number): string {
    return state.glob.parts.slice(index).join('/');
  }

  private seen(path: string, state: State, index: number): boolean {
    return this.visited.get(path)?.has(Walk.key(state, index)) ?? false;
  }

  /** Records the visit; true when ANY of its keys was recorded before — Node's rule. */
  private record(path: string, state: State): boolean {
    let keys = this.visited.get(path);
    if (!keys) this.visited.set(path, (keys = new Set()));
    const before = keys.size;
    for (const index of state.indexes) keys.add(Walk.key(state, index));
    return keys.size !== before + state.indexes.size;
  }

  private visit(path: string, state: State): void {
    if (this.record(path, state)) return;
    const { segments } = state.glob;
    const { indexes, symlinks } = state;
    const last = segments.length - 1;
    const at = (i: number) => segments[i];
    const stat = this.tree.stat(path);
    const throughNonLink = [...indexes].some((i) => !symlinks.has(i));
    const isDirectory = !!stat?.directory || (!!stat?.symlink && throughNonLink);
    const isLast =
      indexes.has(last) || (at(last) === '' && isDirectory && indexes.has(last - 1) && at(last - 1) === GLOBSTAR);

    const root = indexes.has(0) ? this.rootOf(at(0)) : undefined;
    if (root !== undefined) {
      this.schedule(root, this.child(state, [1]));
      return;
    }

    const final = at(last);
    if (isLast && typeof final === 'string') {
      if (this.tree.stat(join(path, final)) && (final || isDirectory)) this.results.add(join(path, final));
      if (indexes.size === 1 && indexes.has(last)) return;
    } else if (isLast && final === GLOBSTAR && (path !== '.' || at(0) === '.' || (last === 0 && stat))) {
      this.results.add(path);
    }

    if (!isDirectory) return;

    const only = indexes.size === 1 ? at([...indexes][0] as number) : undefined;
    let children: readonly GlobEntry[];
    if (typeof only === 'string') {
      // One literal candidate: look it up rather than list — and keep the pattern's
      // spelling, which on a case-insensitive disk may differ from the entry's.
      const found = this.tree.stat(join(path, only));
      if (!found) return;
      children = [{ ...found, name: only }];
    } else {
      children = this.tree.list(path);
    }

    for (const entry of children) {
      const entryPath = join(path, entry.name);
      const next = new Set<number>();
      const nextLinks = new Set<number>();
      for (const index of indexes) {
        this.step(state, entry, entryPath, path, index, isLast, next, nextLinks);
      }
      if (next.size > 0) this.schedule(entryPath, { glob: state.glob, indexes: next, symlinks: nextLinks });
    }
  }

  private step(
    state: State,
    entry: GlobEntry,
    entryPath: string,
    path: string,
    index: number,
    isLast: boolean,
    next: Set<number>,
    nextLinks: Set<number>,
  ): void {
    const { segments } = state.glob;
    const last = segments.length - 1;
    const current = segments[index];
    const fromSymlink = state.symlinks.has(index);
    const test = (i: number): boolean => matches(segments, i, entry.name);

    if (current === GLOBSTAR) {
      // A dot entry is `**`'s only when the segment after it names the dot — and that
      // segment is never another `**`: the compiler collapses `**/**` into one.
      const nextMatches = test(index + 1);
      if (entry.name.startsWith('.') && !nextMatches) return;
      if (!fromSymlink && entry.directory) next.add(index);
      else if (!fromSymlink && index === last) this.results.add(entryPath);
      if (nextMatches && index + 1 === last && !isLast) this.results.add(entryPath);
      else if (nextMatches && entry.directory) next.add(index + 2);
      if ((nextMatches || segments[0] === '.') && (entry.directory || entry.symlink) && !fromSymlink)
        next.add(index + 1);
      if (entry.symlink) nextLinks.add(index);
      if (segments[index + 1] === '..' && entry.directory) this.upward(state, path, index + 1);
      return;
    }
    // Node also carries on past a `.` segment here; the compiler never leaves one where
    // this could see it — a leading `.` roots the walk, the rest are normalised away.
    if (typeof current === 'string') {
      if (test(index) && index !== last) next.add(index + 1);
      return;
    }
    if (current !== undefined && test(index)) {
      if (index === last) this.results.add(entryPath);
      else if (entry.directory) next.add(index + 1);
    }
  }

  /** Where a pattern's first segment starts the walk instead of `.`: a drive, `/`, `..`. */
  private rootOf(first: unknown): string | undefined {
    if (typeof first !== 'string') return undefined;
    if (this.windows && first.endsWith(':')) return `${first}/`;
    if (first === '') return '/';
    if (first === '..') return '../';
    return first === '.' ? '.' : undefined;
  }

  /** `**\/..`: both this directory and its parent carry on from after the `..`. */
  private upward(state: State, path: string, dots: number): void {
    const parent = join(path, '..');
    const last = state.glob.segments.length - 1;
    if (dots < last) {
      for (const where of [path, parent]) {
        if (!this.pending.has(where) && !this.seen(where, state, dots + 1)) {
          this.pending.set(where, [this.child(state, [dots + 1])]);
        }
      }
      return;
    }
    if (!this.seen(path, state, dots)) {
      this.record(path, this.child(state, [dots]));
      this.results.add(path);
    }
    // Asked again, after the record above — as Node asks it.
    if (!this.seen(path, state, dots) || !this.seen(parent, state, dots)) {
      this.record(parent, this.child(state, [dots]));
      this.results.add(parent);
    }
  }

  private child(state: State, indexes: readonly number[]): State {
    return { glob: state.glob, indexes: new Set(indexes), symlinks: new Set() };
  }
}

/**
 * The tree as one walk sees it: each directory listed once and each entry looked at once,
 * and a listing's entries remembered as looked at — Node's glob keeps the same cache. A
 * pattern of six brace alternatives otherwise lists every directory six times.
 */
function memoised(tree: GlobTree): GlobTree {
  const stats = new Map<string, GlobStat | undefined>();
  const lists = new Map<string, readonly GlobEntry[]>();
  return {
    stat: (path) => {
      if (!stats.has(path)) stats.set(path, tree.stat(path));
      return stats.get(path);
    },
    list: (path) => {
      let entries = lists.get(path);
      if (!entries) {
        entries = tree.list(path);
        lists.set(path, entries);
        for (const e of entries) {
          stats.set(join(path, e.name), { directory: e.directory, symlink: e.symlink });
        }
      }
      return entries;
    },
  };
}

/**
 * Whether the segment at `index` takes `name`. Never asked about a `**`: the ones a walk
 * tests are the segments AFTER a `**`, and the compiler collapses `**\/**` into one.
 */
function matches(segments: readonly GlobSegment[], index: number, name: string): boolean {
  const segment = segments[index];
  if (typeof segment === 'string') return segment === name;
  return segment instanceof RegExp && segment.test(name);
}
