export { PerimeterEngine } from './perimeter-engine/perimeter-engine.service';
export { commandPolicy, writePolicy } from './command-policy/command-policy.factory';
export type { ICommandPolicyOptions, IWritePolicyOptions } from './command-policy/command-policy.factory';
export { parseCommand, segments, tokens, commandWords, stripHeredocs } from './bash-parse/bash-parse.util';
