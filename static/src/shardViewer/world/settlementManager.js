// Tiered settlement definitions + draft placement helpers

import { rectWithinBounds, rectOverlapsAny, tilesInRect } from '../utils/geometry.js';
import { queueSettlement, queueTilePatch } from '../state/draftBuffer.js';

export const SETTLEMENT_TIERS = {
  CAMP: {
    key: 'CAMP', label: 'Camp', size: { w: 1, h: 1 },
    npcs: { min: 2, max: 3 }, services: ['rest'], shops: [], walls: false,
    notes: 'Safe rest point; no commerce.'
  },
  HAMLET: {
    key: 'HAMLET', label: 'Hamlet', size: { w: 2, h: 2 },
    npcs: { min: 5, max: 10 }, services: ['rest','healer'], shops: ['general_low'], walls: false,
    notes: 'Tiny community; limited trade.'
  },
  VILLAGE: {
    key: 'VILLAGE', label: 'Village', size: { w: 4, h: 4 },
    npcs: { min: 20, max: 30 }, services: ['rest','healer','shrine'], shops: ['general_std','blacksmith_basic','tavern'], walls: 'palisade',
    notes: 'Real hub; basic guild/quests.'
  },
  CITY: {
    key: 'CITY', label: 'City', size: { w: 8, h: 8 },
    npcs: { min: 100, max: 250 }, services: ['rest','healer','temple','guilds'], shops: ['market_std','blacksmith_adv','enchanter_basic','tavern'], walls: 'stone',
    notes: 'Districts, factions, advanced crafting.'
  },
  KINGDOM: {
    key: 'KINGDOM', label: 'Kingdom', size: { w: 16, h: 16 },
    npcs: { min: 300, max: 1200 }, services: ['rest','temple','academy','guilds','bank'], shops: ['grand_market','blacksmith_master','enchanter_adv','exotics'], walls: 'fortified',
    notes: 'Capital scale; wonders & epic quests.'
  }
};

export function canPlaceSettlement({ shard, startX, startY, tierKey }) {
  const tier = SETTLEMENT_TIERS[tierKey];
  if (!tier) return { ok: false, reason: 'Unknown tier' };
  const { w, h } = tier.size;
  const maxW = shard?.size?.width || shard?.width || shard?.tiles?.[0]?.length || 0;
  const maxH = shard?.size?.height || shard?.height || shard?.tiles?.length || 0;
  if (!rectWithinBounds(startX, startY, w, h, maxW, maxH)) return { ok: false, reason: 'Out of bounds' };
  const existing = (shard.settlements || []).map(s => ({ x: s.bounds.x, y: s.bounds.y, w: s.bounds.w, h: s.bounds.h }));
  if (rectOverlapsAny(startX, startY, w, h, existing)) return { ok: false, reason: 'Overlaps existing settlement' };
  // Simple suitability: do not allow all-water rectangles
  const areaTiles = tilesInRect(startX, startY, w, h).map(({x,y}) => shard.tiles?.[y]?.[x]).filter(Boolean);
  const allWater = areaTiles.length>0 && areaTiles.every(t => ['ocean','river','lake','reef','water'].includes(String(t.biome||'').toLowerCase()));
  if (allWater) return { ok: false, reason: 'Area unsuitable (water only)' };
  return { ok: true };
}

export function draftPlaceSettlement({ shard, startX, startY, tierKey, name = null }) {
  const tier = SETTLEMENT_TIERS[tierKey];
  if (!tier) throw new Error('Unknown tier');
  const id = `settle_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
  const bounds = { x: startX, y: startY, w: tier.size.w, h: tier.size.h };
  const settlementDraft = {
    id,
    name: name || tier.label,
    tier: tier.key,
    bounds,
    npcs_est: tier.npcs,
    services: tier.services,
    shops: tier.shops,
    walls: tier.walls,
    meta: { seed: cryptoSeed(), createdAt: new Date().toISOString(), notes: tier.notes }
  };
  tilesInRect(bounds.x, bounds.y, bounds.w, bounds.h)
    .forEach(({x,y}) => queueTilePatch(x,y, { settlementId: id, tags: ['settlement_area'] }));
  queueSettlement(settlementDraft);
  return settlementDraft;
}

function cryptoSeed(){ try{ const a=new Uint32Array(2); (globalThis.crypto||window.crypto).getRandomValues(a); return `${a[0].toString(16)}${a[1].toString(16)}`; }catch{ return Math.random().toString(16).slice(2); } }

