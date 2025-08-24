// static/js/api.js
export const API = {
  async world() {
    const r = await fetch('/api/world');
    return r.json();
  },
  async spawn({ x = 12, y = 15, noclip = false } = {}) {
    const qs = noclip ? '?noclip=1' : '';
    const r = await fetch('/api/spawn' + qs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
    return r.json();
  },
  async move(dx, dy) {
    const r = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dx, dy }),
    });
    return r.json();
  },
  async interact() {
    const r = await fetch('/api/interact', { method: 'POST' });
    return r.json();
  },
  async state() {
    const r = await fetch('/api/state');
    return r.json();
  },
};

export function urlHasNoclip() {
  const p = new URLSearchParams(location.search);
  return p.get('noclip') === '1' || p.get('noclip') === 'true';
}
