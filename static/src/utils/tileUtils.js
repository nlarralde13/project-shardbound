
// /src/utils/tileUtils.js

import { zoomLevel } from '../ui/camera.js';

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
