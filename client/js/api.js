// static/js/api.js
// Unified API client for auth, characters, inventory, and equipment persistence.

export const API = {
  // ----- Game/world endpoints you already use -----
  async world() {
    const r = await fetch('/api/world', { credentials: 'include' });
    return r.json();
  },

  async spawn({ x = 12, y = 15, noclip = false, devmode = false } = {}) {
    const params = new URLSearchParams();
    if (noclip) params.set('noclip', '1');
    if (devmode) params.set('devmode', '1');
    const qs = params.toString();
    const r = await fetch('/api/spawn' + (qs ? `?${qs}` : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ x, y }),
    });
    const out = await r.json();
    if (Array.isArray(out.log)) {
      window.dispatchEvent(new CustomEvent('game:log', {
        detail: out.log.map(t => ({ text: t, ts: Date.now() })),
      }));
    }
    return out;
  },

  async move(dx, dy) {
    const r = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dx, dy }),
    });
    const out = await r.json();
    if (Array.isArray(out.log)) {
      window.dispatchEvent(new CustomEvent('game:log', {
        detail: out.log.map(t => ({ text: t, ts: Date.now() })),
      }));
    }
    return out;
  },

  async look() {
    const r = await fetch('/api/look', { credentials: 'include' });
    const out = await r.json();
    if (Array.isArray(out.log)) {
      window.dispatchEvent(new CustomEvent('game:log', {
        detail: out.log.map(t => ({ text: t, ts: Date.now() })),
      }));
    }
    return out;
  },

  async interact() {
    const r = await fetch('/api/interact', { method: 'POST', credentials: 'include' });
    const out = await r.json();
    if (Array.isArray(out.log)) {
      window.dispatchEvent(new CustomEvent('game:log', {
        detail: out.log.map(t => ({ text: t, ts: Date.now() })),
      }));
    }
    return out;
  },

  // ----- Character flow (YOUR routes under /api/game) -----
  async characterActive() {
    const r = await fetch('/api/game/characters/active', { credentials: 'include' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Failed to get active character');
    return r.json();
  },

  async selectCharacter(characterId) {
    const r = await fetch('/api/game/characters/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ character_id: characterId }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Select failed');
    return data;
  },

  async autosaveCharacter(payload) {
    const r = await fetch('/api/game/characters/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Autosave failed');
    return data;
  },

  // ----- Convenience -----
  async characterIdOrThrow() {
    const active = await this.characterActive();
    const characterId = active?.character_id || active?.id;
    if (!characterId) throw new Error('No active character');
    return characterId;
  },

  // ----- Equipment / Loadout (PERSISTENCE) -----
  /**
   * GET /api/characters/:id/loadout
   * -> { equipped: {slot: item|null}, inventory: [...], derived_stats: {...} }
   */
  async loadout(characterId) {
    const [invRes, eqRes] = await Promise.all([
      fetch(`/api/characters/${characterId}/inventory`, { credentials: 'include' }),
      fetch(`/api/characters/${characterId}/equipment`, { credentials: 'include' })
    ]);
    if (!invRes.ok) throw new Error('inventory load failed');
    if (!eqRes.ok) throw new Error('equipment load failed');
    const inv = await invRes.json();
    const eq = await eqRes.json();
    return { character_id: characterId, inventory: inv.items || [], equipped: eq };
  },

async getEquipment(characterId) {
  const r = await fetch(`/api/characters/${characterId}/equipment`, { credentials: 'include' });
  if (!r.ok) throw new Error('equipment fetch failed');
  return r.json();
},
  /**
   * POST /api/characters/:id/equip { character_item_id?, slug?, slot }
   * -> same DTO as loadout()
   */
  // Equip by slug or character_item_id (v2 semantics)
  async equip(characterId, { slot, slug, character_item_id, replace = false }) {
    const body = { slot, replace };
    if (character_item_id != null) body.character_item_id = character_item_id;
    if (slug) body.slug = slug;
    const r = await fetch(`/api/characters/${characterId}/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || data.message || 'equip failed');
    const eqRes = await fetch(`/api/characters/${characterId}/equipment`, { credentials: 'include' });
    const eq = eqRes.ok ? await eqRes.json() : {};
    return { character_id: characterId, inventory: data.items || [], equipped: eq };
  },

  /**
   * POST /api/characters/:id/unequip { slot }
   * -> same DTO as loadout()
   */
  async unequip(characterId, { slot }) {
  const r = await fetch(`/api/characters/${characterId}/unequip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ slot }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.message || 'unequip failed');
  const eqRes = await fetch(`/api/characters/${characterId}/equipment`, { credentials: 'include' });
  const eq = eqRes.ok ? await eqRes.json() : {};
  return { character_id: characterId, inventory: data.items || [], equipped: eq };
},
};

// Backward-compatible named export some code may already import
export async function autosaveCharacterState(partialState) {
  return API.autosaveCharacter(partialState);
}
