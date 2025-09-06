// Render a simple 3x3 town grid
export function renderTown(container, rooms, player) {
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'town-grid';
  rooms.forEach(r => {
    const cell = document.createElement('div');
    cell.className = 'room';
    cell.textContent = r.label || r.kind;
    cell.style.gridRowStart = r.room_y + 1;
    cell.style.gridColumnStart = r.room_x + 1;
    if (r.room_x === player.x && r.room_y === player.y) cell.classList.add('player');
    grid.appendChild(cell);
  });
  container.appendChild(grid);
}
