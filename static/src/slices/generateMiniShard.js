// static/src/slices/generateMiniShard.js

import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import { renderShard } from '../shards/renderShard.js';
import { playerState } from '../players/playerState.js';
import { getState, setState } from '../utils/state.js';

export function generateMiniShard(tileData) {
  console.log('[MiniShard] Generating from tile:', tileData);

  let wrapper = document.getElementById('mapViewer');
  if (!wrapper) {
    console.warn('[MiniShard] #viewportWrapper not found. Creating fallback container.');
    wrapper = document.createElement('div');
    wrapper.id = 'viewportWrapper';
    wrapper.style.position = 'relative';
    wrapper.style.zIndex = '0';
    document.body.appendChild(wrapper);
  }

  wrapper.innerHTML = ''; // Clear any previous content
  wrapper.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.id = `miniShard_${tileData.x}_${tileData.y}`;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.zIndex = '1';
  wrapper.appendChild(canvas);

  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  canvas.style.display = 'block';
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';

  const backBtn = document.createElement('button');
  backBtn.textContent = '⬅ Back to Shard';
  backBtn.style.position = 'absolute';
  backBtn.style.top = '10px';
  backBtn.style.left = '10px';
  backBtn.style.zIndex = '10';
  backBtn.onclick = () => {
    location.reload(); // TODO: Replace with proper shard restore function
  };
  wrapper.appendChild(backBtn);

  const ctx = canvas.getContext('2d');

  const miniShard = {
    width: 12,
    height: 12,
    tiles: []
  };

  for (let y = 0; y < 12; y++) {
    const row = [];
    for (let x = 0; x < 12; x++) {
      const biome = tileData.biome === 'forest'
        ? (Math.random() < 0.25 ? 'tree' : 'grass')
        : 'grass';
      row.push({ x, y, biome, entry: x === 6 && y === 11 });
    }
    miniShard.tiles.push(row);
  }

  const originX = (miniShard.width * TILE_WIDTH) / 2;
  const originY = TILE_HEIGHT / 2;
  renderShard(ctx, miniShard, null, originX, originY, false, true);

  const entry = miniShard.tiles[11][6];
  playerState.x = entry.x;
  playerState.y = entry.y;
  playerState.draw(ctx, originX, originY);

  document.addEventListener('keydown', e => {
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (dx !== 0 || dy !== 0) {
      playerState.moveBy(dx, dy);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderShard(ctx, miniShard, null, originX, originY, false, true);
      playerState.draw(ctx, originX, originY);
    }
  });
}
