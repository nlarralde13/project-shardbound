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

/** Map of namespace -> executor function */
const executors = new Map();

/**
 * registerExecutor(namespace, fn)
 * Stores an executor for a namespace.
 * @param {string} namespace
 * @param {(ctx: object) => Promise<Frame[]>} fn
 */
export function registerExecutor(namespace, fn) {
  if (typeof namespace !== 'string' || typeof fn !== 'function') return;
  executors.set(namespace, fn);
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
    if (def && executors.has(def.namespace)) {
      const exec = executors.get(def.namespace);
      const frames = await exec({ line, command: link, context, def });
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

// Default system executor with built-in commands
registerExecutor('system', async ({ command }) => {
  if (command.cmd === 'help') {
    const cmds = registry.list();
    return [
      {
        type: 'table',
        data: cmds.map(c => ({ command: c.name, description: c.description || '' }))
      }
    ];
  }
  if (command.cmd === 'clear') {
    return [{ type: 'status', data: { clear: true } }];
  }
  return [{ type: 'text', data: `Unknown system command: ${command.cmd}` }];
});

export default { registerExecutor, dispatch };

