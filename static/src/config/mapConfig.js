// /static/src/config/mapConfig.js
// -----------------------------------------------------------------------------
// Single source of truth for map/shard sizing and zoom behavior.
// Keep exports *named* to avoid breaking existing imports.
// -----------------------------------------------------------------------------

/** Default logical shard size (tiles). */
export const SHARD_WIDTH  = 64;   // was 10 → standardized to 64 for performance & IO
export const SHARD_HEIGHT = 64;

/** Hard caps — useful if you later allow custom shard sizes via UI. */
export const MAX_SHARD_WIDTH  = 64;
export const MAX_SHARD_HEIGHT = 64;

/** Isometric sprite tile footprint (if using ISO rendering elsewhere). */
export const TILE_WIDTH  = 32;
export const TILE_HEIGHT = 16;

/** Orthographic editor cell size (used by 2D editor if needed). */
export const ORTHO_TILE_SIZE = 16;

/** Discrete zoom steps for your PIXI/isometric renderer. */
export const ZOOM_LEVELS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5];
export const DEFAULT_ZOOM_INDEX = 0;

// export const devMode = true;

/* ---------------------------------------------------------------------------
   Tweak notes
   - If you decide to allow “big shards” again, bump SHARD_WIDTH/HEIGHT here
     and ensure your loader/editor still calls fit-to-shard at startup.
   - Recommended to keep MAX_* at powers of two (32/64/128) so future chunking
     by 32×32 or 64×64 regions lands on even boundaries.
   - Keep this file tiny: it should be safe to import from anywhere.
--------------------------------------------------------------------------- */
