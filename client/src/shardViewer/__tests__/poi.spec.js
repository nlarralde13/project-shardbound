import assert from 'assert';
import { migrateToCanonicalShard, validateShard } from '../schema.js';

function test(name, fn) {
  try { fn(); console.log('ok -', name); }
  catch (e) { console.error('fail -', name); console.error(e); process.exitCode = 1; }
}

test('accepts shardgate POI and preserves target meta', () => {
  const src = {
    shard_id: 'test', size: { width: 4, height: 4 },
    tiles: Array.from({ length: 4 }, (_, y) => Array.from({ length: 4 }, (_, x) => ({ x, y, biome: 'grass' }))),
    pois: [{ id: 'p1', type: 'shardgate', x: 1, y: 2, name: 'Gate', description: 'to elsewhere', meta: { target_shard_id: 'ABCD', target_x: 7, target_y: 9 } }]
  };
  const c = migrateToCanonicalShard(src);
  const v = validateShard(c);
  assert.ok(v.ok, 'schema compatible');
  const p = c.pois[0];
  assert.strictEqual(p.type, 'shardgate');
  assert.strictEqual(p.meta.target_shard_id, 'ABCD');
  assert.strictEqual(p.meta.target_x, 7);
  assert.strictEqual(p.meta.target_y, 9);
});

