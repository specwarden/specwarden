import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { IAgentRuntime, IPerimeterPolicy, IPerimeterVerdict } from '../../../domain';
import { claudeAgentRuntime } from '../../../infrastructure';
import { PerimeterEngine } from '../../perimeter';
import {
  type IPerimeterModule,
  perimeterDeclaration,
} from '../../perimeter/perimeter-declaration/perimeter-declaration.util';
import type { ICliIo } from '../_shared/cli-io/cli-io.model';
import { CONFIG_DIR } from '../_shared/find-config/find-config.util';
import { resolveDeclaration } from '../_shared/resolve-declaration/resolve-declaration.util';

/**
 * Evaluate a raw hook payload against a set of policies — the pure core, so a test needs
 * neither stdin nor a file.
 *
 * `runtime` decides how the payload is read and how a refusal is spoken; it defaults
 * to Claude Code because that is what shipped first, NOT because the perimeter is
 * about Claude. The policies — never force-push, never drop a volume — have nothing to
 * do with which model is typing, so a consumer running its own assistant supplies its
 * own runtime here and keeps every policy it already wrote.
 */
export function evaluatePayload(
  payload: unknown,
  policies: readonly IPerimeterPolicy[],
  runtime: IAgentRuntime = claudeAgentRuntime,
): { code: number; message?: string } {
  const intent = runtime.parse(payload);
  if (!intent) return { code: 0 };
  const verdict: IPerimeterVerdict = new PerimeterEngine(policies).evaluate(intent);
  return { code: runtime.exitCode(verdict), message: verdict.blocked ? runtime.formatBlock(verdict) : undefined };
}

/** The perimeter declaration, by convention — the sibling of `CONFIG_FILE`. */
export const PERIMETER_FILE = 'perimeter.mjs';

/** Walk up from `cwd` to the first `.specwarden/perimeter.mjs`, in either layout
 * `resolveDeclaration` accepts — flat, or in its own folder beside its test. */
function findPerimeterFile(cwd: string): string | undefined {
  let dir = cwd;
  for (;;) {
    const candidate = resolveDeclaration(join(dir, CONFIG_DIR), PERIMETER_FILE);
    if (candidate) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * The `perimeter` command — the PreToolUse entry. It reads a payload, evaluates it
 * against the consumer's policies and exits 2 to block or 0 to allow. It FAILS OPEN on
 * every error path: a missing perimeter file, a malformed payload, a broken policy — all
 * exit 0, because a perimeter that turns a fault into a block halts work while
 * wearing the face of a rule.
 */
export async function perimeter(cwd: string, readStdin: () => string, io: ICliIo): Promise<number> {
  try {
    const file = findPerimeterFile(cwd);
    if (!file) return 0; // no policies declared → nothing to enforce
    // A consumer's perimeter.mjs may export `runtime` beside `policies`; the two live in
    // the same file because a set of policies and the tool it guards are chosen together.
    const { policies, runtime } = perimeterDeclaration((await import(pathToFileURL(file).href)) as IPerimeterModule);
    const raw = readStdin().trim();
    const { code, message } = evaluatePayload(raw ? JSON.parse(raw) : {}, policies, runtime);
    if (message) io.err(message);
    return code;
  } catch {
    return 0;
  }
}
