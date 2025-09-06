import * as registry from '../commandRegistry.js';

export function generateMarkdown() {
  const cmds = registry.list().filter(c => !c.hidden);
  let out = '# Commands\n\n';
  for (const c of cmds) {
    out += `## ${c.name}\n\n`;
    if (c.description) out += `${c.description}\n\n`;
    if (c.usage) out += `Usage: ${c.usage}\n\n`;
    if (c.examples?.length) {
      out += 'Examples:\n';
      for (const ex of c.examples) out += `- ${ex}\n`;
      out += '\n';
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(generateMarkdown());
}
