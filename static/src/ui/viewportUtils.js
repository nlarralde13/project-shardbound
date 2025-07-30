export function calculateViewportSize(tileWidth, tileHeight, maxCols = 100, maxRows = 100) {
  const availableWidth = window.innerWidth - 400; // leave room for UI panels
  const availableHeight = window.innerHeight - 200;

  const cols = Math.min(Math.floor(availableWidth / tileWidth), maxCols);
  const rows = Math.min(Math.floor(availableHeight / tileHeight), maxRows);

  return { cols, rows };
}
