// /static/src/ui/uiUtils.js

/**
 * Toggle the visibility of a single panel.
 * @param {string} targetId  ID of the panel to show/hide
 */
export function togglePanel(targetId) {
  console.log(`[uiUtils] togglePanel called for "${targetId}"`);
  const panel = document.getElementById(targetId);
  if (!panel) {
    console.warn(`[uiUtils] No panel found with id="${targetId}"`);
    return;
  }

  const wasVisible = panel.style.display === 'block';
  panel.style.display = wasVisible ? 'none' : 'block';
  console.log(`[uiUtils] Panel "${targetId}" wasVisible=${wasVisible}, now display="${panel.style.display}"`);

  // flip the toggle symbol on its button (if present)
  const btn = document.querySelector(`button.panel-toggle[data-target="${targetId}"]`);
  if (!btn) {
    console.warn(`[uiUtils] No toggle button found for panel "${targetId}"`);
    return;
  }

  const symbol = btn.querySelector('span');
  if (symbol) {
    symbol.textContent = wasVisible ? '＋' : '–';
    console.log(`[uiUtils] Button symbol flipped to "${symbol.textContent}"`);
  } else {
    console.warn(`[uiUtils] Button for "${targetId}" has no <span> to update symbol`);
  }
}

/**
 * Wire up a panel so that clicking its header toggles an .expanded class.
 * @param {string} panelId  ID of the panel whose header toggles it
 */
export function makePanelToggle(panelId) {
  console.log(`[uiUtils] makePanelToggle called for "${panelId}"`);
  const panel = document.getElementById(panelId);
  if (!panel) {
    console.warn(`[uiUtils] No panel found with id="${panelId}"`);
    return;
  }

  const header = panel.querySelector('.panelHeader');
  if (!header) {
    console.warn(`[uiUtils] Panel "${panelId}" has no .panelHeader element`);
    return;
  }

  header.addEventListener('click', () => {
    panel.classList.toggle('expanded');
    console.log(`[uiUtils] Panel "${panelId}" toggled expanded=${panel.classList.contains('expanded')}`);
  });

  console.log(`[uiUtils] Panel "${panelId}" header listener attached`);
}
