export { PerimeterEngine } from './perimeter-engine/perimeter-engine.service';
export { commandRule, writeRule } from './command-rule/command-rule.factory';
export type { ICommandRuleSpec, IWriteRuleSpec } from './command-rule/command-rule.factory';
export { parseCommand, segments, tokens, commandWords, stripHeredocs } from './bash-parse/bash-parse.util';
