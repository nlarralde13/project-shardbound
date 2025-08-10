// /static/src/shards/generateMiniShard.js

import { renderShard } from './renderShard.js';
import { getShardCanvasSize } from './shardLoader.js';
import { setState } from '../utils/state.js';
// Optional: only used if your camera exports it
import { centerCameraOnPlayer } from '../ui/camera.js';

export async function generateMiniShard(tileMeta) {
  console.log('[MiniShard] Generating from tile:', tileMeta);

  // 1) Clear the viewer FIRST, then create wrapper/canvas
  const mapViewer = document.getElementById('mapViewer');
  if (!mapViewer) throw new Error('[MiniShard] #mapViewer not found');
  mapViewer.innerHTML = '';

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.id = 'viewportWrapper';
  wrapper.style.position = 'relative';
  wrapper.style.display = 'flex';
  wrapper.style.justifyContent = 'center';
  wrapper.style.alignItems = 'center';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.overflow = 'auto';
  mapViewer.appendChild(wrapper);

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'viewport';
  canvas.style.display = 'block';
  canvas.style.transformOrigin = 'center center';
  wrapper.appendChild(canvas);

  // 2) MiniShard dims & canvas sizing
  const width = 10;
  const height = 10;
  const TILE_WIDTH = 32;
  const TILE_HEIGHT = 16;

  const { width: canvasW, height: canvasH } =
    getShardCanvasSize(width, height, TILE_WIDTH, TILE_HEIGHT);

  canvas.width = Math.ceil(canvasW);
  canvas.height = Math.ceil(canvasH);

  // 3) Build tile grid (simple biome echo from parent tile)
  const biome = tileMeta?.biome || 'grass';
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      biome,
      explored: false,
      tags: [],
      resources: [],
      encounter: null,
      x, y,
    }))
  );

  const miniShard = {
    id: `minishard_${tileMeta?.x ?? 0}_${tileMeta?.y ?? 0}`,
    width,
    height,
    tiles,
    origin: { x: tileMeta?.x ?? 0, y: tileMeta?.y ?? 0 },
    isMiniShard: true,
  };

  // 4) Spawn player at entry (center for now)
  const entry = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  setState({ x: entry.x, y: entry.y });

  // 5) Render (use current renderShard signature w/ opts)
  const ctx = canvas.getContext('2d');
  const originX = (width * TILE_WIDTH) / 2;
  const originY = TILE_HEIGHT / 2;
  renderShard(ctx, miniShard, { origin: { originX, originY } });

  // 6) Center view on player/token
  try {
    if (typeof centerCameraOnPlayer === 'function') {
      centerCameraOnPlayer();
    } else {
      // Fallback: compute screen coords of entry tile and scroll wrapper
      const sx = originX + (entry.x - entry.y) * (TILE_WIDTH / 2);
      const sy = originY + (entry.x + entry.y) * (TILE_HEIGHT / 2);
      const targetLeft = Math.max(0, sx - wrapper.clientWidth / 2);
      const targetTop  = Math.max(0, sy - wrapper.clientHeight / 2);
      wrapper.scrollTo({ left: targetLeft, top: targetTop, behavior: 'auto' });
    }
  } catch (e) {
    console.warn('[MiniShard] centerCameraOnPlayer failed, using fallback.', e);
    const sx = originX + (entry.x - entry.y) * (TILE_WIDTH / 2);
    const sy = originY + (entry.x + entry.y) * (TILE_HEIGHT / 2);
    wrapper.scrollTo({
      left: Math.max(0, sx - wrapper.clientWidth / 2),
      top: Math.max(0, sy - wrapper.clientHeight / 2),
      behavior: 'auto'
    });
  }

  // 7) Back to shard button (temporary)
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Back to Shard';
  backBtn.style.position = 'absolute';
  backBtn.style.top = '10px';
  backBtn.style.left = '10px';
  backBtn.onclick = () => location.reload(); // TODO: replace with real parent-shard loader
  mapViewer.appendChild(backBtn);
}
