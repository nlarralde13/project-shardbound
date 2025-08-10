// Viewport HUD: top-right Map button + bottom contextual action row.

import {
  getViewportState,
  onViewportChange,
  goConsole,
  goWorld,
  goRegion,
  goMiniShard
} from '../state/viewportState.js';

export function mountViewportHUD(wrapperSel = '#viewportWrapper') {
  const wrapper = document.querySelector(wrapperSel) || document.getElementById('mapViewer');
  if (!wrapper) return console.warn('[viewportHUD] wrapper not found');

  wrapper.style.position = 'relative';

  // Map button (top-right)
  let mapBtn = wrapper.querySelector('.vp-mapbtn');
  if (!mapBtn) {
    mapBtn = document.createElement('button');
    mapBtn.className = 'vp-mapbtn';
    mapBtn.title = 'Map';
    mapBtn.textContent = '🗺️';
    wrapper.appendChild(mapBtn);
  }

  // Action row (bottom)
  let actionRow = wrapper.querySelector('.vp-actions');
  if (!actionRow) {
    actionRow = document.createElement('div');
    actionRow.className = 'vp-actions';
    wrapper.appendChild(actionRow);
  }

  // Map button cycle behavior
  mapBtn.addEventListener('click', () => {
    const { current } = getViewportState();
    if (current === 'console') goWorld();
    else if (current === 'world') goConsole();
    else if (current === 'region') goWorld();
    else if (current === 'minishard') goRegion({ fromMiniShard: true });
  });

  const renderActions = () => {
    const { current } = getViewportState();
    actionRow.innerHTML = '';

    const add = (label, handler) => {
      const b = document.createElement('button');
      b.className = 'vp-action';
      b.textContent = label;
      b.addEventListener('click', handler);
      actionRow.appendChild(b);
    };

    switch (current) {
      case 'console':
        add('Start Adventure', () => goWorld());
        add('Load Game', () => document.getElementById('loadShardBtn')?.click());
        break;
      case 'world':
        add('Zoom to Region', () => goRegion({ regionId: 'auto' }));
        add('Center on Player', () => window?.playerState?.centerOnPlayer?.());
        break;
      case 'region':
        add('Explore Tile', () => window?.dispatchExploreSelected?.());
        add('Back to World', () => goWorld());
        break;
      case 'minishard':
        add('Back to Region', () => goRegion({ fromMiniShard: true }));
        break;
    }
  };

  renderActions();
  onViewportChange(renderActions);
}
