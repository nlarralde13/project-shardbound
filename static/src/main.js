import { renderShard } from './shards/renderShard.js';
import { createTooltip, updateTooltip, hideTooltip } from './ui/tooltip.js';
import { initCamera, centerViewport } from './ui/camera.js';
import { TILE_WIDTH, TILE_HEIGHT } from './config/mapConfig.js';
import { saveShard, loadShardFromFile, regenerateShard } from './utils/shardLoader.js';


let hoveredTile = null;



async function loadSettings() {
    const res = await fetch('/static/src/settings.json');
    return res.json();
}

async function loadShard() {
    const res = await fetch('/static/public/shards/shard_0_0.json');
    return res.json();
}

//GET HOVER INFO AND DISPLAY UNDER MOUSE
function getTileUnderMouse(mouseX, mouseY, TILE_WIDTH, TILE_HEIGHT, originX, originY, shard) {
    let dx = mouseX - originX;
    let dy = mouseY - originY;
    let isoX = Math.floor((dx / (TILE_WIDTH / 2) + dy / (TILE_HEIGHT / 2)) / 2);
    let isoY = Math.floor((dy / (TILE_HEIGHT / 2) - dx / (TILE_WIDTH / 2)) / 2);  
    if (isoX >= 0 && isoX < shard.width && isoY >= 0 && isoY < shard.height) {
        let tile = shard.tiles[isoY][isoX];
        return { ...tile, x: isoX, y: isoY };
    }
    return null;
}

//DRAW CANVAS
window.addEventListener('DOMContentLoaded', async () => {
    const settings = await loadSettings();
    console.log("[Settings] Loaded:", settings);

    if (settings.devMode) {
        const devTools = document.getElementById('devToolsPanel');
        const devStats = document.getElementById('devStatsPanel');
        if (devTools) devTools.style.display = 'block';
        if (devStats) devStats.style.display = 'block';
        console.log("[DevMode] Dev tools enabled");
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'canvasWrapper';
    wrapper.style.width = `${50 * TILE_WIDTH}px`;
    wrapper.style.height = `${50 * TILE_HEIGHT}px`;
    wrapper.style.position = 'relative'; 
    

    const canvas = document.createElement('canvas');
    canvas.width = 50 * TILE_WIDTH;
    canvas.height = 50 * TILE_HEIGHT;
    wrapper.appendChild(canvas);

    const viewportEl = document.getElementById('viewport');
    if (!viewportEl) {
        console.error("[Error] #viewport element not found!");
        return;
    }

    viewportEl.appendChild(wrapper);

    const ctx = canvas.getContext('2d');
    const shard = await loadShard();
    //console.log("[main.js] 🧩 About to render shard:", shard);
    renderShard(ctx, shard);
    //console.log("[main.js] ✅ renderShard() was called");


    // === Dev Tools Button Hooks ===
    if (settings.devMode) {
      // Save shard to file
      document.getElementById('saveShard').addEventListener('click', () => {
        saveShard(shard);
      });

      // Load shard from uploaded file
      document.getElementById('loadShardBtn').addEventListener('click', () => {
        document.getElementById('loadShardInput').click();
      });

      document.getElementById('loadShardInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        loadShardFromFile(file, (newShard) => {
          shard.tiles = newShard.tiles;
          shard.width = newShard.width;
          shard.height = newShard.height;
          hoveredTile = null;
          renderShard(ctx, shard);
        });
      });

      // Regenerate default shard
      document.getElementById('regenWorld').addEventListener('click', () => {
        regenerateShard(settings, (newShard) => {
          shard.tiles = newShard.tiles;
          shard.width = newShard.width;
          shard.height = newShard.height;
          hoveredTile = null;
          renderShard(ctx, shard);
        });
      });
    }

    let brushMode = false;

    document.getElementById('toggleBrush').addEventListener('click', () => {
      brushMode = !brushMode;
      document.getElementById('biomeEditorPanel').style.display = brushMode ? 'block' : 'none';
      console.log(`[Brush] Brush mode is now ${brushMode ? 'ON' : 'OFF'}`);
    });



    

    //init camera and map zoom
    centerViewport(viewportEl, canvas);
    initCamera(canvas, ctx, shard, renderShard, `zoomOVerlay`);
    


    const tooltip = createTooltip();

    const originX = canvas.width / 2;
    const originY = 40;

    canvas.addEventListener('mousemove', (e) => {
      const bounds = canvas.getBoundingClientRect();
      const mouseX = e.clientX - bounds.left;
      const mouseY = e.clientY - bounds.top;
      const tile = getTileUnderMouse(mouseX, mouseY, TILE_WIDTH, TILE_HEIGHT, originX, originY, shard);

      //console.log("[main.js] 🎯 Calling updateTooltip with:", tile); // ✅ NOW it's safe

      if (!tile || (hoveredTile && tile.x === hoveredTile.x && tile.y === hoveredTile.y)) {
        return; // no change
      }

      hoveredTile = tile;
      updateTooltip(tooltip, tile, e.pageX, e.pageY, settings.devMode);
      renderShard(ctx, shard, hoveredTile);
    });

    canvas.addEventListener('click', (e) => {
    if (!brushMode) return;

    const bounds = canvas.getBoundingClientRect();
    const mouseX = e.clientX - bounds.left;
    const mouseY = e.clientY - bounds.top;
    const tile = getTileUnderMouse(mouseX, mouseY, TILE_WIDTH, TILE_HEIGHT, originX, originY, shard);
    if (!tile) return;

    const selectedBiome = document.getElementById('biomeSelect').value;
    tile.biome = selectedBiome;

    console.log(`[Brush] Painted tile (${tile.x}, ${tile.y}) as ${selectedBiome}`);
    renderShard(ctx, shard, tile);
  });



    canvas.addEventListener('mouseleave', () => {
        hideTooltip(tooltip);
    });
  

});
