// static/src/main2.js

import {
  togglePanel,
  initPanelToggles,
  initDevTools,
  initGridToggle
} from './ui/panels.js';
import { initCamera,setRedrawFn, applyZoom} from './ui/camera.js';
import { initTileClick }   from './ui/tooltip.js';
import { initChat }        from './ui/chat.js';
import { renderShard }     from './shards/renderShard.js';
import { getState, setState } from './utils/state.js';
import { TILE_WIDTH, TILE_HEIGHT } from './config/mapConfig.js';
import { loadAndSizeShard } from './shards/shardLoader.js';
import { keyboard } from './utils/keyboard.js';
import { playerState } from './players/playerState.js';
import { initActionButtons } from './ui/actionMenu.js';
import { generateMiniShard } from './slices/generateMiniShard.js';

//Orchestration 
window.addEventListener('DOMContentLoaded', async () => {
  // 1️⃣ Load settings & initialize panel toggles
  const settings = await fetch('/static/src/settings.json').then(r => r.json());
  setState('useIsometric', settings.useIsometric ?? true);
  initPanelToggles();

  // 2️⃣ Grab DOM elements & load/size the shard
  const canvas  = document.getElementById('viewport');
  const wrapper = document.getElementById('mapViewer');
  const { data: shardData, ctx } = await loadAndSizeShard(canvas, wrapper);

  const canvasWidth = (shardData.width + shardData.height) * (TILE_WIDTH / 2);
  const canvasHeight = (shardData.width + shardData.height) * (TILE_HEIGHT / 2);

  canvas.width = canvasWidth ;
  canvas.height = canvasHeight ;
  console.log(canvas.width, canvas.height)


  // 3️⃣ Compute isometric origins
  const originX = (shardData.width  * TILE_WIDTH)  / 2;
  const originY = TILE_HEIGHT / 2;

  //define redraw function
  function redraw(selectedTile = null) {
    // reset transform
    ctx.resetTransform?.() || ctx.setTransform(1, 0, 0, 1, 0, 0);

    // draw map with current flags
    const showGrid = getState('showGrid');
    const useIso   = getState('useIsometric');
    renderShard(ctx, shardData, selectedTile, originX, originY, showGrid, useIso);

    // draw player token
    playerState.draw(ctx, originX, originY);
  }
  setRedrawFn(redraw);

  // 4️⃣ Define a dynamic render function that always picks up latest flags
  const renderFn = (c, data, sel, oX, oY, showGrid) => {
    const iso = getState('useIsometric');
    renderShard(c, data, sel, oX, oY, showGrid, iso);
  };

  // 5️⃣ Initial draw
  redraw(getState('selectedTile'));
  
  //init player state
  await playerState.init({
    settings,
    shardData,
    redrawFn: redraw
  });

  window.getPlayerPosition = () => playerState.getPosition();


  //Setup Keyboard
  keyboard.onPress(e => {
    if (['ArrowUp','w'].includes(e.key))    playerState.moveBy(0, -1);
    if (['ArrowDown','s'].includes(e.key))  playerState.moveBy(0, +1);
    if (['ArrowLeft','a'].includes(e.key))  playerState.moveBy(-1, 0);
    if (['ArrowRight','d'].includes(e.key)) playerState.moveBy(+1, 0);
  });

  //hold for sprint
  if (keyboard.isDown(' ')) {

  }

  // 6️⃣ Wire up DevTools, grid toggle, camera, tile‐click, chat, and action buttons
  initDevTools({
    shardData,
    settings,
    canvas,
    wrapper,
    ctx,
    redraw,
    originX,
    originY
  });

  initGridToggle({
    shardData,
    ctx,
    redraw, 
    originX,
    originY
  });

  initCamera({ canvas, wrapper, ctx, shardData, originX, originY, getState, setState });
  applyZoom(1, originX, originY)

  initTileClick({ canvas, wrapper, shardData, originX, originY, ctx, redraw });

  initChat('#chatHistory', '#chatInput');

  initActionButtons('.action-btn', 'Huk');
});
