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
    const exec = executors.get(link.cmd);
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

