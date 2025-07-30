// /src/utils/devUtils.js
import { tileWidth, tileHeight, centerX, centerY } from '../constants/mapConfig.js';

export function drawIsoTileGrid(ctx, rows, cols) {
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 1;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const px = Math.round(centerX + (x - y) * (tileWidth / 2));
            const py = Math.round(centerY + (x + y) * (tileHeight / 2));

            ctx.beginPath();
            ctx.moveTo(px, py + tileHeight / 2);
            ctx.lineTo(px + tileWidth / 2, py);
            ctx.lineTo(px + tileWidth, py + tileHeight / 2);
            ctx.lineTo(px + tileWidth / 2, py + tileHeight);
            ctx.closePath();
            ctx.stroke();
        }
    }
}
