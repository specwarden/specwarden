/**
 * Every scene here is a consumer's LAPTOP unless it says otherwise.
 *
 * GitHub Actions sets `CI` and `GITHUB_ACTIONS` for the whole job, the scenes' spawns
 * inherited them, and under `GITHUB_ACTIONS=true` the CLI defaults to the github reporter.
 * So 22 scenes asserting what a terminal shows were red on every CI run and green on every
 * laptop, and the heavy tier was red on main from the day it first ran there.
 *
 * Removed once, before any scene of the file runs — not in `playgroundEnv()`, because a
 * scene about CI sets them itself for the length of one run (`withEnv` in
 * `journeys/a-day-one.spec.ts`, the env column in `journeys/e-cli.spec.ts`), and still must.
 */
delete process.env.CI;
delete process.env.GITHUB_ACTIONS;
