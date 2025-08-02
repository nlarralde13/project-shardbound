// static/src/main2.js

import {
  togglePanel,
  initPanelToggles,
  initDevTools,
  initGridToggle
} from './ui/panels.js';
import { initCamera }      from './ui/camera.js';
import { initTileClick }   from './ui/tooltip.js';
import { initChat }        from './ui/chat.js';
import { initActionButtons } from './ui/actions.js';
import { renderShard }     from './shards/renderShard.js';
import { getState, setState } from './utils/state.js';
import { TILE_WIDTH, TILE_HEIGHT } from './config/mapConfig.js';
import { loadAndSizeShard } from './shards/shardLoader.js';

window.addEventListener('DOMContentLoaded', async () => {
  // 1️⃣ Load settings & initialize panel toggles
  const settings = await fetch('/static/src/settings.json').then(r => r.json());
  setState('useIsometric', settings.useIsometric ?? true);
  initPanelToggles();

  // 2️⃣ Grab DOM elements & load/size the shard
  const canvas  = document.getElementById('viewport');
  const wrapper = document.getElementById('viewportWrapper');
  const { data: shardData, ctx } = await loadAndSizeShard(canvas, wrapper);

  // 3️⃣ Compute isometric origins
  const originX = (shardData.width  * TILE_WIDTH)  / 2;
  const originY = TILE_HEIGHT / 2;

  // 4️⃣ Define a dynamic render function that always picks up latest flags
  const renderFn = (c, data, sel, oX, oY, showGrid) => {
    const iso = getState('useIsometric');
    renderShard(c, data, sel, oX, oY, showGrid, iso);
  };

  // 5️⃣ Initial draw
  renderFn(
    ctx,
    shardData,
    getState('selectedTile'),
    originX,
    originY,
    getState('showGrid')
  );

  // 6️⃣ Wire up DevTools, grid toggle, camera, tile‐click, chat, and action buttons
  initDevTools({
    shardData,
    settings,
    canvas,
    wrapper,
    ctx,
    renderFn,
    originX,
    originY
  });

  


  initGridToggle(canvas, wrapper, shardData, ctx, originX, originY);

  initCamera({ canvas, wrapper, ctx, shardData, originX, originY, getState, setState });

  initTileClick({ canvas, wrapper, shardData, originX, originY, ctx, renderFn });

  initChat('#chatHistory', '#chatInput');

  initActionButtons('.action-btn', 'Player1');
});
