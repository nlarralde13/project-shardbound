// static/js/api.js
export const API = {
  // ----- existing game endpoints -----
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
    return r.json();
  },

  async interact() {
    const r = await fetch('/api/interact', { method: 'POST', credentials: 'include' });
    return r.json();
  },

  async state() {
    const r = await fetch('/api/state', { credentials: 'include' });
    return r.json();
  },

  async action(verb, payload = {}) {
    const action_id = (globalThis.crypto && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const r = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ verb, payload, action_id }),
    });
    return r.json();
  },

  // ----- auth helpers -----
  async me() {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (!r.ok) throw new Error('Unauthenticated');
    return r.json();
  },

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  },

  async updateUser(payload) {
    const r = await fetch('/api/auth/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Update failed');
    return data;
  },

  // ----- character API -----
  async charactersList() {
    const r = await fetch('/api/characters', { credentials: 'include' });
    if (!r.ok) throw new Error('Failed to list characters');
    return r.json();
  },

  async characterCreate(payload) {
    const r = await fetch('/api/game/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Create failed');
    return data;
  },

  async characterSelect(character_id) {
    const r = await fetch('/api/characters/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ character_id })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Select failed');
    return data;
  },

  async characterActive() {
    const r = await fetch('/api/characters/active', { credentials: 'include' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Failed to get active character');
    return r.json();
  },

  async autosaveCharacter(payload) {
    const r = await fetch('/api/characters/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload || {})
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Autosave failed');
    return data;
  },
};

export async function autosaveCharacterState(partialState) {
  return API.autosaveCharacter(partialState);
}

export function urlHasNoclip() {
  const p = new URLSearchParams(location.search);
  return p.get('noclip') === '1' || p.get('noclip') === 'true';
}
