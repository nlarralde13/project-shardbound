// Lightweight client-side validation wrappers for draft + shard
// If Ajv is available on window (Ajv2020), we use it; else perform minimal checks.

import schema from './schema/worldSchema.json' assert { type: 'json' };

let ajv;
export function initValidator() {
  if (!ajv && window.Ajv2020) {
    ajv = new window.Ajv2020({ allErrors: true });
    ajv.addSchema(schema, 'world');
  }
  return ajv;
}

export function validateShardWorld(shard) {
  const v = initValidator()?.getSchema('world');
  if (v) {
    const ok = v(shard);
    return { valid: !!ok, errors: v.errors || [] };
  }
  // Minimal fallback: check basics
  const errs = [];
  if (!shard || typeof shard !== 'object') errs.push('root: object required');
  const H = shard?.tiles?.length|0, W = shard?.tiles?.[0]?.length|0;
  if (!Array.isArray(shard?.tiles) || H<=0 || W<=0) errs.push('tiles: 2D matrix required');
  return { valid: errs.length === 0, errors: errs };
}

export function validateDraftAgainstSchema(draft) {
  const errors = [];
  const s = draft?.settlements || {};
  for (const id of Object.keys(s)) {
    const it = s[id];
    if (!it?.bounds) errors.push({ id, msg: 'missing bounds' });
  }
  return { valid: errors.length === 0, errors };
}

