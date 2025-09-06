// completions.js - simple command completions for the console
// Exports: complete(prefix, ctx) -> { suggestion: string, list: string[] }

import { list as commandList } from './commandRegistry.js';

export function complete(prefix = '', ctx = {}) {
  const commands = commandList(ctx);
  const tokens = new Set();
  for (const def of commands) {
    if (!prefix || def.name.startsWith(prefix)) tokens.add(def.name);
  }
  if (Array.isArray(ctx.items)) {
    for (const item of ctx.items) {
      if (!prefix || item.startsWith(prefix)) tokens.add(item);
    }
  }
  if (Array.isArray(ctx.npcs)) {
    for (const npc of ctx.npcs) {
      if (!prefix || npc.startsWith(prefix)) tokens.add(npc);
    }
  }
  const list = Array.from(tokens).sort();
  return { suggestion: list[0] || '', list };
}

export default { complete };
