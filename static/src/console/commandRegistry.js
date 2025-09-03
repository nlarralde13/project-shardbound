/**
 * commandRegistry.js - lightweight command registry for the in-page console.
 *
 * Each command definition can expose metadata such as:
 * {
 *   name: 'help',            // primary command token
 *   aliases: ['?'],          // optional alternative tokens
 *   namespace: 'system',     // logical grouping (e.g. 'system', 'dev')
 *   description: 'Show help' // free-form description or usage
 *   // ...any other fields required by the caller (e.g. execute fn)
 * }
 *
 * The registry stores definitions by name and supports alias lookups.
 * It provides helper functions to register commands, fetch them and
 * resolve user input.
 */

class CommandRegistry {
  constructor() {
    /** @type {Map<string, object>} command name -> definition */
    this.commands = new Map();
    /** @type {Map<string, string>} alias token -> command name */
    this.aliases = new Map();
  }

  /**
   * register(cmdDef) -> store a command definition.
   * Existing definitions with the same name are overwritten.
   * Aliases are stored for quick lookup.
   * @param {object} cmdDef definition with at least a `name` property
   * @returns {object} the registered definition
   */
  register(cmdDef) {
    if (!cmdDef?.name) return cmdDef;
    this.commands.set(cmdDef.name, cmdDef);
    if (Array.isArray(cmdDef.aliases)) {
      for (const alias of cmdDef.aliases) {
        this.aliases.set(alias, cmdDef.name);
      }
    }
    return cmdDef;
  }

  /**
   * get(nameOrAlias) -> fetch a command definition by name or alias.
   * @param {string} nameOrAlias
   * @returns {object|undefined} the command definition if found
   */
  get(nameOrAlias) {
    if (!nameOrAlias) return undefined;
    const name = this.aliases.get(nameOrAlias) || nameOrAlias;
    return this.commands.get(name);
  }

  /**
   * list(filter?) -> return an array of command definitions.
   * Optional filter: { namespace?: string }
   * @param {object} [filter]
   * @param {string} [filter.namespace] only commands from this namespace
   * @returns {object[]} array of command definitions
   */
  list(filter = {}) {
    const out = [];
    for (const def of this.commands.values()) {
      if (filter.namespace && def.namespace !== filter.namespace) continue;
      out.push(def);
    }
    return out;
  }

  /**
   * resolve(inputToken) -> { name, def } or null if not found.
   * Helps the caller map user input to the canonical command name.
   * @param {string} inputToken
   * @returns {{name: string, def: object}|null}
   */
  resolve(inputToken) {
    const def = this.get(inputToken);
    if (!def) return null;
    return { name: def.name, def };
  }
}

// Preload registry with example system commands.
const registry = new CommandRegistry();

registry.register({
  name: 'help',
  aliases: ['?'],
  namespace: 'system',
  description: 'List available commands.'
});

registry.register({
  name: 'clear',
  aliases: ['cls'],
  namespace: 'system',
  description: 'Clear console output.'
});

// Export bound helpers and the registry instance.
export const register = registry.register.bind(registry);
export const get = registry.get.bind(registry);
export const list = registry.list.bind(registry);
export const resolve = registry.resolve.bind(registry);

export default registry;
