
// /src/utils/tileUtils.js

//import { zoomLevel } from '../ui/camera.js';

export function getTileUnderMouse(mouseX, mouseY, canvas, tileWidth, tileHeight, originX, originY, shard) {
    const scrollLeft = canvas.parentElement.scrollLeft;
    const scrollTop = canvas.parentElement.scrollTop;
    const zoom = window.currentZoom || 1;

    const dx = (mouseX + scrollLeft - originX) / zoom;
    const dy = (mouseY + scrollTop - originY) / zoom;

    const x = Math.floor((dx / (tileWidth / 2) + dy / (tileHeight / 2)) / 2);
    const y = Math.floor((dy / (tileHeight / 2) - dx / (tileWidth / 2)) / 2);

    if (x >= 0 && x < shard.width && y >= 0 && y < shard.height) {
        return { ...shard.tiles[y][x], x, y };
    }

    return null;
}


export function updateDevStatsPanel(tile) {
  const statsBox = document.getElementById('statsContent');
  if (statsBox) {
    statsBox.innerHTML = `<pre>${JSON.stringify(tile, null, 2)}</pre>`;
  }

  const actionsBox = document.getElementById('tileActions');
  if (actionsBox) {
    actionsBox.innerHTML = `
      <button id="exploreTile">▶ Explore</button>
      <button id="editTile">🛠 Edit Room</button>
    `;

    document.getElementById('exploreTile').addEventListener('click', () => {
      console.log("[Action] ▶ Explore triggered for tile:", tile);
    });

    document.getElementById('editTile').addEventListener('click', () => {
      console.log("[Action] 🛠 Edit Room triggered for tile:", tile);
    });
  }
}




