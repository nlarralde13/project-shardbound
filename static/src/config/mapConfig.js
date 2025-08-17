// Map & view constants for MVP1 (orthographic)
export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 32;

export const SHARD_COLS = 16;
export const SHARD_ROWS = 16;

export const ZOOM_LEVELS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]; // 100% → 30%
export const DEFAULT_ZOOM_INDEX = 0; // 100%
export const CAMERA_DEBOUNCE_MS = 500;

export const BACKDROP_COLOR = '#000000';

export const VIEW = {
  // Internal padding to keep the shard “floating” on black
  marginPx: 16,
};
