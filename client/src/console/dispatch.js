/**
 * dispatcher.js - lightweight command dispatcher with local executors.
 *
 * Example usage:
 *   import { parse } from './parse.js';
 *   import { dispatch } from './dispatch.js';
 *   const parsed = parse('help');
 *   const frames = await dispatch({ line: 'help', ...parsed }, {
 *     rpcExec: async ({ line }) => [{ type: 'text', data: `remote: ${line}` }]
 *   });
 *   console.log(frames);
 *
 * @typedef {Object} Frame
 * @property {('text'|'table'|'status'|'json')} type
 * @property {any} data
 */

import * as registry from './commandRegistry.js';
import { findShardgateAt, getRoomShard } from '/static/js/roomLoader.js';
import { updateActionHUD } from '/static/js/actionHud.js';

/** Map of command -> executor function */
const executors = new Map();

/**
 * registerExecutor(cmd, fn)
 * Stores an executor for a command name.
 * @param {string} cmd command token
 * @param {(ctx: object) => Promise<Frame[]>} fn executor
 */
export function registerExecutor(cmd, fn) {
  if (typeof cmd !== 'string' || typeof fn !== 'function') return;
  executors.set(cmd, fn);
}

/**
 * dispatch(parsed, { rpcExec })
 * Executes parsed commands either locally or via RPC.
 * @param {{ line?: string, chain?: object[], context?: any }} parsed
 * @param {{ rpcExec?: ({ line: string, context?: any }) => Promise<Frame[]> }} opts
 * @returns {Promise<Frame[]>}
 */
export async function dispatch(parsed = {}, { rpcExec } = {}) {
  const out = [];
  const { line = '', chain = [], context } = parsed;
  for (const link of chain) {
    const def = registry.get(link.cmd);
    const exec = executors.get(link.cmd) || (def ? executors.get(def.name) : undefined);
    if (exec) {
      const frames = await exec({ line, command: link, context, def, rpcExec });
      if (Array.isArray(frames)) out.push(...frames);
    } else if (rpcExec) {
      const cmdLine = buildLine(link);
      const frames = await rpcExec({ line: cmdLine, context });
      if (Array.isArray(frames)) out.push(...frames);
    } else {
      out.push({ type: 'text', data: `Unknown command: ${link.cmd}` });
    }
  }
  return out;
}

// helper to rebuild a command string
function buildLine(link) {
  let s = link.cmd;
  if (link.args?.length) {
    s += ' ' + link.args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ');
  }
  if (link.flags) {
    for (const [k, v] of Object.entries(link.flags)) {
      if (v === true) s += ` --${k}`;
      else s += ` --${k}=${v}`;
    }
  }
  return s;
}

// Default local executors
registerExecutor('help', async ({ command, rpcExec }) => {
  const target = command.args?.[0];
  if (!target) {
    const cmds = registry.list().filter(c => !c.hidden);
    return [
      {
        type: 'table',
        data: cmds.map(c => ({ command: c.name, description: c.description || '' }))
      }
    ];
  }
  const def = registry.get(target);
  if (def) {
    const lines = [def.description || ''];
    if (def.usage) lines.push(`Usage: ${def.usage}`);
    if (def.examples?.length) {
      lines.push('Examples:');
      for (const ex of def.examples) lines.push(`  ${ex}`);
    }
    return [{ type: 'text', data: lines.join('\n') }];
  }
  if (rpcExec) {
    return await rpcExec({ line: `help ${target}` });
  }
  return [{ type: 'text', data: `No help available for ${target}` }];
});

registerExecutor('clear', async () => [{ type: 'status', data: { clear: true } }]);

export default { registerExecutor, dispatch };

// ---- Game executors ---------------------------------------------------------

async function localSearchOrLook() {
  const shard = window.__lastShard || getRoomShard();
  const pos = { x: (window.currentRoom?.x|0), y: (window.currentRoom?.y|0) };
  const frames = [];
  const gate = findShardgateAt(shard, pos.x, pos.y);
  if (gate) {
    const line = 'There is a Shardgate here.';
    // Console output
    frames.push({ type: 'text', data: line });
    // Mirror to game log
    try { window.dispatchEvent(new CustomEvent('game:log', { detail: [{ type: 'log', text: line, ts: Date.now() }] })); } catch {}
    // Surface action in HUD
    try { updateActionHUD({ interactions: { can_search: true, can_enter_shardgate: true } }); } catch {}
  } else {
    frames.push({ type: 'text', data: 'You find nothing of note.' });
  }
  return frames;
}

registerExecutor('search', async ({ rpcExec }) => {
  if (rpcExec) return await rpcExec({ line: 'search' });
  return await localSearchOrLook();
});

registerExecutor('look', async ({ rpcExec }) => {
  if (rpcExec) return await rpcExec({ line: 'look' });
  return await localSearchOrLook();
});

