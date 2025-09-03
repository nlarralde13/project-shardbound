// completions.js - simple command completions for the console
// Exports: complete(prefix, ctx) -> { suggestion: string, list: string[] }

import { list as commandList } from './commandRegistry.js';

export function complete(prefix = '', ctx = {}) {
  const commands = commandList(ctx);
  const tokens = [];
  for (const def of commands) {
    if (!prefix || def.name.startsWith(prefix)) tokens.push(def.name);
  }
  tokens.sort();
  return { suggestion: tokens[0] || '', list: tokens };
}

export default { complete };
