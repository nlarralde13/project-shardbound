// /static/src/ui/viewportHud.js
// Viewport HUD: Map button + optional action row (safe for ESM in browsers)

import {
  getViewportState,
  onViewportChange,
  goConsole,
  goShard,
  goSlice,
} from '../state/viewportState.js';

export function mountViewportHUD(wrapperSel = '#viewportWrapper') {
  const wrapper = document.querySelector(wrapperSel) || document.getElementById('mapViewer');
  if (!wrapper) {
    console.warn('[viewportHUD] wrapper not found:', wrapperSel);
    return;
  }
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

  // ✅ guard against double-binding if HUD is mounted more than once
  if (!mapBtn.dataset.bound) {
    mapBtn.addEventListener('click', () => {
      const { current } = getViewportState();
      // Toggle: console <-> any map state
      if (current === 'console') {
        goShard();         // open the shard map (your primary map view)
      } else {
        goConsole();       // return to gameboard
      }
    });
    mapBtn.dataset.bound = '1';
  }

  // Optional: bottom action row (kept minimal; your main action bar is separate)
  let actionRow = wrapper.querySelector('.vp-actions');
  if (!actionRow) {
    actionRow = document.createElement('div');
    actionRow.className = 'vp-actions';
    actionRow.style.display = 'none'; // hide if you don't want HUD actions
    wrapper.appendChild(actionRow);
  }

  const renderActions = () => {
    const { current } = getViewportState();
    actionRow.innerHTML = '';

    // If you ever want HUD-level quick actions again, uncomment below.
    // const add = (label, handler) => {
    //   const b = document.createElement('button');
    //   b.className = 'vp-action';
    //   b.textContent = label;
    //   b.addEventListener('click', handler);
    //   actionRow.appendChild(b);
    // };

    // Example of state-aware actions (disabled by default):
    // if (current === 'shard') {
    //   add('Back to Console', () => goConsole());
    // } else if (current === 'slice') {
    //   add('Back to Shard', () => goShard());
    // } else if (current === 'room') {
    //   add('Back to Slice', () => goSlice({ fromRoom: true }));
    // } else if (current === 'console') {
    //   add('Open Map', () => goShard());
    // }
  };

  renderActions();
  onViewportChange(renderActions);
}
