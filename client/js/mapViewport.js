/* mapViewport.js
   Simple 32x32 tile map with zoom, pan, hover and select events.
   Public events: dispatches 'map:hover' and 'map:select'.
*/

const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');
const tileSize = 32;
let zoom = 1;
let offsetX = 0;
let offsetY = 0;

const width = 20;
const height = 15;
const tiles = [];
for (let y = 0; y < height; y++) {
  const row = [];
  for (let x = 0; x < width; x++) {
    row.push({ type: (x + y) % 2 === 0 ? 'grass' : 'water' });
  }
  tiles.push(row);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const size = tileSize * zoom;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y][x];
      ctx.fillStyle = t.type === 'grass' ? '#3a5' : '#35a';
      ctx.fillRect(offsetX + x * size, offsetY + y * size, size, size);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.strokeRect(offsetX + x * size, offsetY + y * size, size, size);
    }
  }
}

function tileFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const size = tileSize * zoom;
  const x = Math.floor((e.clientX - rect.left - offsetX) / size);
  const y = Math.floor((e.clientY - rect.top - offsetY) / size);
  if (x >= 0 && y >= 0 && x < width && y < height) {
    return { x, y, ...tiles[y][x] };
  }
  return null;
}

let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
  if (dragging) {
    offsetX += e.clientX - lastX;
    offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    draw();
  }
  const tile = tileFromEvent(e);
  if (tile) document.dispatchEvent(new CustomEvent('map:hover', { detail: tile }));
});

canvas.addEventListener('mouseup', () => (dragging = false));
canvas.addEventListener('mouseleave', () => (dragging = false));

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  zoom = Math.min(3, Math.max(0.5, zoom + delta));
  draw();
});

canvas.addEventListener('click', (e) => {
  const tile = tileFromEvent(e);
  if (tile) document.dispatchEvent(new CustomEvent('map:select', { detail: tile }));
});

draw();

