// The Node floor the CLI shim refuses beneath, read from the package's own `engines.node`.
//
// Compared as three numbers — never as a string, and never by the major alone. A string
// comparison puts 18.9 after 18.18; a major-only reading (what the shim did while the
// floor was a bare `>=24`) lets 18.0 through a floor of 18.18, to die later on something
// 18.0 does not have, with a message about that instead of about the version.
//
// Build-free ESM on purpose: the shim runs before anything is compiled.

/** `[major, minor, patch]` of the version a `>=x.y.z` range starts at, or undefined when it names none. */
export function floorOf(range) {
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range ?? '');
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : undefined;
}

/** Whether `running` — `process.versions.node` — is older than `floor`. */
export function isBelow(running, floor) {
  const parts = running.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const have = parts[i] ?? 0;
    if (have !== floor[i]) return have < floor[i];
  }
  return false;
}

/** What the shim prints: the floor in full, what is running, and the one thing to do. */
export const refusal = (floor, running) =>
  `specwarden: needs node >= ${floor.join('.')}, and this shell runs ${running}.\n` +
  `  switch it to node ${floor.join('.')} or newer and run the command again.\n`;
