/**
 * The NestJS plugin's public surface.
 *
 * A plugin is a folder per unit like everything else in this monorepo, so the barrel
 * stays the only file a consumer's import path depends on — and adding a second
 * NestJS rule means a sibling folder, not a longer index.
 */
export { nestjs } from './nestjs/nestjs.plugin';
export type { INestjsOptions } from './nestjs/nestjs.plugin';
