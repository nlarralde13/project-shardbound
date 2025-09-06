/**
 * parse(line) -> { chain: [ { cmd, args, flags } ] } or { error:{message, position} }
 *
 * Examples:
 *   // 1. Simple command
 *   // parse('look') => { chain:[{cmd:'look', args:[], flags:{}}] }
 *   // 2. Command with argument
 *   // parse('move north') => { chain:[{cmd:'move', args:['north'], flags:{}}] }
 *   // 3. Quoted argument
 *   // parse('use "rusty sword"') => { chain:[{cmd:'use', args:['rusty sword'], flags:{}}] }
 *   // 4. Flags
 *   // parse('attack --target=wolf -k v') => { chain:[{cmd:'attack', args:[], flags:{target:'wolf', k:'v'}}] }
 *   // 5. Chained commands
 *   // parse('say "hi"; look') => { chain:[{cmd:'say', args:['hi'], flags:{}},{cmd:'look', args:[], flags:{}}] }
 *   // 6. Error case
 *   // parse('look "unterminated') => { error:{message:'Unclosed quote', position:5} }
 */

export function parse(line = '') {
  if (typeof line !== 'string') {
    return { error: { message: 'Input must be string', position: 0 } };
  }

  const segments = [];
  let current = '';
  let inQuote = false;
  let segStart = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === ';' && !inQuote) {
      if (current.trim()) segments.push({ text: current.trim(), start: segStart });
      current = '';
      segStart = i + 1;
    } else {
      current += ch;
    }
  }

  if (inQuote) {
    return { error: { message: 'Unclosed quote', position: line.length } };
  }
  if (current.trim()) segments.push({ text: current.trim(), start: segStart });

  const chain = [];
  for (const seg of segments) {
    const tokRes = tokenize(seg.text, seg.start);
    if (tokRes.error) return { error: tokRes.error };
    const tokens = tokRes.tokens;
    if (!tokens.length) continue;
    const cmd = tokens[0];
    const { args, flags } = parseArgs(tokens.slice(1));
    chain.push({ cmd, args, flags });
  }
  return { chain };
}

function tokenize(seg, offset) {
  const tokens = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === '"') {
      if (inQuote) {
        inQuote = false;
        tokens.push(current);
        current = '';
      } else {
        if (current) {
          tokens.push(current);
          current = '';
        }
        inQuote = true;
      }
    } else if (/\s/.test(ch) && !inQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (inQuote) {
    return { error: { message: 'Unclosed quote', position: offset + seg.length } };
  }
  if (current) tokens.push(current);
  return { tokens };
}

function parseArgs(tokens) {
  const args = [];
  const flags = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      if (eq !== -1) {
        const key = t.slice(2, eq);
        const val = t.slice(eq + 1);
        flags[key] = val === '' ? true : val;
      } else {
        const key = t.slice(2);
        const next = tokens[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (t.startsWith('-') && t.length > 1) {
      const key = t.slice(1);
      const next = tokens[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(t);
    }
  }
  return { args, flags };
}

export default { parse };
