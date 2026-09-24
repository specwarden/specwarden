/**
 * The glob golden set: the trees, the patterns, and what Node's own `fs.globSync` found
 * in them — recorded once, on Node 24.21, per platform (`scripts/record-glob-golden.mjs`).
 *
 * WHY RECORDED AND NOT COMPARED LIVE. The engine's glob exists because the runtime's is
 * not one thing: Node 18 and 20 have none; 22.x, 24.0–24.20, 25.x and 26.0–26.7 skip
 * sibling entries on an early return; 22.0–22.22.0, 24.0–24.13.0 and 25.0–25.3 skip a dot
 * directory after `**`; and 26.9 stopped following a directory link that a segment after
 * `**` names. A live comparison would measure whichever of those the machine happens to
 * run — the maintainer's 24.9 among them. A recording measures the one answer the engine
 * promises.
 *
 * Plain ESM with no dependency, because it is read in three places: the recorder, the
 * vitest contract (`file-source.glob.contract.spec.ts`), and the build-free runner that
 * holds the published `dist` to the same answers on every Node the engine supports
 * (`core/_playground/runtime.test.mjs`).
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';

export const GOLDEN_PATH = new URL('./glob.golden.json', import.meta.url);

/** The golden set as data. */
export const readGolden = () => JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

/**
 * A scratch directory holding `tree/` — the root the patterns are globbed from — and
 * `sibling/` beside it, so that `../sibling/*.md` has one deterministic answer.
 */
export function buildTree(spec) {
  const base = mkdtempSync(join(tmpdir(), 'spw-glob-'));
  const root = join(base, 'tree');
  for (const file of spec.files) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file);
  }
  for (const dir of spec.dirs ?? []) mkdirSync(join(root, dir), { recursive: true });
  for (const file of spec.sibling ?? []) {
    const full = join(base, 'sibling', file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file);
  }
  for (const link of spec.links ?? []) {
    const full = join(root, link.path);
    mkdirSync(dirname(full), { recursive: true });
    // A junction is the directory link Windows grants without elevation; posix ignores it.
    symlinkSync(link.target, full, link.kind === 'dir' ? 'junction' : 'file');
  }
  for (const dir of spec.unreadable ?? []) chmodSync(join(root, dir), 0o000);
  const cleanup = () => {
    for (const dir of spec.unreadable ?? []) chmodSync(join(root, dir), 0o755);
    rmSync(base, { recursive: true, force: true });
  };
  return { root, cleanup };
}

/**
 * Whether this machine can build `section`'s tree as recorded: file symlinks need
 * elevation on Windows, and a directory nobody may read is only unreadable to somebody
 * who is not root.
 */
export function buildable(section, platform = process.platform) {
  if ((section.tree.links ?? []).some((l) => l.kind !== 'dir') && platform === 'win32') return false;
  if ((section.tree.unreadable ?? []).length > 0) {
    if (platform === 'win32') return false;
    if (typeof process.getuid === 'function' && process.getuid() === 0) return false;
  }
  return true;
}

/**
 * The recorded answers of `section` on `platform`, or undefined when that platform was
 * never recorded. A section marked `sharedAcrossPlatforms` answers the same everywhere —
 * the recorder refuses to write one that does not.
 */
export function recordedFor(section, platform) {
  return section.recorded[platform] ?? (section.sharedAcrossPlatforms ? Object.values(section.recorded)[0] : undefined);
}

/** Every recording but win32's is a posix one; darwin is recorded as nothing yet. */
const POSIX_RECORDING = 'linux';

/**
 * What each file source is held to, section by section, with the reason for anything it
 * is not held to — so a skip is a sentence in the output rather than a silent absence.
 *
 * - `disk` (NodeFileSource): every section recorded on this platform that can be built
 *   here.
 * - `memory` (InMemoryFileSource): a map holds files and nothing else — no links, no
 *   permissions, nothing outside its root — and ignores case on no platform, so it is
 *   held to the posix recording of the sections it can represent.
 */
export function goldenPlan(source, platform = process.platform) {
  const golden = readGolden();
  const plan = [];
  for (const [name, section] of Object.entries(golden.sections)) {
    const skip = (why) => plan.push({ name, section, skip: why, cases: [] });
    if (source === 'memory' && (section.tree.links || section.tree.unreadable)) {
      skip('a map holds no links and no permissions');
      continue;
    }
    const recorded = recordedFor(section, source === 'memory' ? POSIX_RECORDING : platform);
    if (!recorded) {
      skip(`never recorded on ${platform}`);
      continue;
    }
    if (source === 'disk' && !buildable(section, platform)) {
      skip(`cannot be built on ${platform} by this user`);
      continue;
    }
    const cases = section.patterns
      .filter((pattern) => source === 'disk' || !leavesTheRoot(pattern))
      .map((pattern) => ({ pattern, expected: recorded[pattern] }));
    plan.push({ name, section, cases });
  }
  return plan;
}

/** A pattern that reaches past the root — nothing a map rooted nowhere can answer. */
const leavesTheRoot = (pattern) => /^(?:\.\.[/\\]|[/\\]|<root>)/.test(pattern);

/**
 * A pattern as it is globbed in `root`, and an answer as it is compared: `<root>` stands
 * for the root on a disk. A map has no root on any disk, and neither is rewritten.
 */
export const inRoot = (pattern, root) => (root ? pattern.replace('<root>', root.split(sep).join('/')) : pattern);
export const fromRoot = (paths, root) =>
  root ? paths.map((p) => p.replace(root.split(sep).join('/'), '<root>')) : paths;
