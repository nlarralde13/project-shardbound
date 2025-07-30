// /static/src/ui/uiUtil.js

/**
 * Find the panel by ID, then wire up its header
 * so that clicking it toggles the `.expanded` class.
 */
export function makePanelToggle(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const header = panel.querySelector('.panelHeader');
  if (!header) return;

  header.addEventListener('click', () => {
    panel.classList.toggle('expanded');
  });
}
