import { initGridToggle, initPanelToggles, initDevTools }       from './ui/panels.js';
import { initCamera }           from './ui/camera.js';
import { initTileClick }          from './ui/tooltip.js';
import { initChat }  from './ui/chat.js';
import { renderShard }            from './shards/renderShard.js';
import { getState, setState }     from './utils/state.js';
import { TILE_WIDTH, TILE_HEIGHT } from './config/mapConfig.js';
import { initActionButtons } from './ui/actions.js';
import { loadAndSizeShard } from './shards/shardLoader.js';



window.addEventListener('DOMContentLoaded', async () => {
  initPanelToggles();

  const canvas  = document.getElementById('viewport');
  const wrapper = document.getElementById('viewportWrapper');

  const { data: shardData, ctx } = await loadAndSizeShard(canvas, wrapper);
  const originX = (shardData.width * TILE_WIDTH)/2;
  const originY = TILE_HEIGHT/2;
  console.log('ORIGIN', originX, originY)

  renderShard(ctx, shardData, getState('selectedTile'), originX, originY, getState('showGrid'));


  //init dev tools
  const settings = await fetch('/static/src/settings.json').then(r => r.json());

  initDevTools({
    shardData,
    onShardUpdated: newShard => {
      // update any local references if you need to
    },
    settings,
    canvas,
    wrapper,
    ctx,
    renderFn: renderShard,
    originX,
    originY
  });


  initGridToggle(canvas,wrapper,shardData,ctx)
  initCamera({ canvas, wrapper, ctx, shardData, originX, originY, getState, setState });
  initTileClick({ canvas, wrapper, shardData, originX, originY, ctx });

  initChat('#chatHistory', '#chatInput');
  initActionButtons('.action-btn', 'Lord Marticus');
});
