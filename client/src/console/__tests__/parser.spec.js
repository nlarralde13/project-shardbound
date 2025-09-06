import assert from 'assert';
import { parse } from '../parse.js';

function test(name, fn) {
  try {
    fn();
    console.log('ok -', name);
  } catch (e) {
    console.error('fail -', name);
    console.error(e);
    process.exitCode = 1;
  }
}

test('handles quoted arguments', () => {
  const res = parse('say "hello world"');
  assert.deepStrictEqual(res.chain[0].args, ['hello world']);
});

test('parses flags', () => {
  const res = parse('attack --target=wolf -k v');
  assert.deepStrictEqual(res.chain[0].flags, { target: 'wolf', k: 'v' });
});

test('supports chaining', () => {
  const res = parse('look; move north');
  assert.strictEqual(res.chain.length, 2);
  assert.deepStrictEqual(res.chain.map(c => c.cmd), ['look', 'move']);
});

test('unknown command still parsed', () => {
  const res = parse('foobar');
  assert.strictEqual(res.chain[0].cmd, 'foobar');
});

test('empty input yields empty chain', () => {
  const res = parse('   ');
  assert.deepStrictEqual(res.chain, []);
});

test('extra semicolons are ignored', () => {
  const res = parse('look;;;say hi');
  assert.deepStrictEqual(res.chain.map(c => c.cmd), ['look', 'say']);
});
