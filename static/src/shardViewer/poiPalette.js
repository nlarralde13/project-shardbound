/**
 * POI Palette: buttons to choose POI type.
 */
import { POI_TYPES } from './schema.js';

export function createPoiPalette({ mount, tools, onSelect }) {
  mount.innerHTML = '';
  const title = document.createElement('h3'); title.textContent = 'POI Palette'; mount.appendChild(title);
  const row = document.createElement('div'); row.className = 'poi-row'; mount.appendChild(row);
  for (const t of POI_TYPES) {
    const b = document.createElement('button'); b.className = 'poi-btn'; b.dataset.type = t; b.textContent = t;
    b.addEventListener('click', () => {
      tools.setPOIType(t);
      tools.setTool?.('poi');
      // toggle toolbar button state
      document.querySelectorAll('[data-tool]')?.forEach(b => b.classList.toggle('active', b.dataset.tool === 'poi'));
      highlight(t);
      onSelect?.(t);
    });
    row.appendChild(b);
  }
  function highlight(t){ row.querySelectorAll('.poi-btn').forEach(el => el.classList.toggle('active', el.dataset.type === t)); }
  highlight(tools.poiType);
}
