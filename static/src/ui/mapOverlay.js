import { uiColors } from '../utils/colorUtils.js';

export function drawGrid(ctx, { cols, rows, tileW, tileH }) {
  ctx.save();
  ctx.strokeStyle = uiColors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= cols; c++) {
    const x = c * tileW + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rows * tileH);
  }
  for (let r = 0; r <= rows; r++) {
    const y = r * tileH + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(cols * tileW, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawSelection(ctx, { x, y, tileW, tileH }) {
  if (x < 0 || y < 0) return;
  ctx.save();
  ctx.fillStyle = uiColors.selection;
  ctx.fillRect(x * tileW, y * tileH, tileW, tileH);
  ctx.restore();
}

export function drawHover(ctx, { x, y, tileW, tileH }) {
  if (x < 0 || y < 0) return;
  ctx.save();
  ctx.fillStyle = uiColors.hover;
  ctx.fillRect(x * tileW, y * tileH, tileW, tileH);
  ctx.restore();
}
