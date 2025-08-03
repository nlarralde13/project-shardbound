// /static/src/playerState.js

import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import { renderShard } from '../shards/renderShard.js';

// Map each biome to the appropriate token key
const BIOME_TOKEN_MAP = {
  water: 'boat',
  grass: 'character',
  forest: 'character',
  desert: 'character',
  tundra: 'character',
  mountain: 'character'
};

// Paths to token images
const TOKEN_PATHS = {
  boat: '/static/assets/2d/boat.png',
  character: '/static/assets/2d/character.png'
};

export const playerState = {
  // Current player position on the grid
  position: { x: 25, y: 25 },

  // Currently active token key and image
  activeToken: null,
  tokenImages: {},

  // Reference to shard data and redraw function
  shardData: null,
  redrawFn: null,

  /**
   * Initialize playerState: set starting position, preload tokens, and capture redraw
   * @param {{ settings: object, shardData: object, redrawFn: function }} opts
   */
  async init({ settings, shardData, redrawFn }) {
    this.shardData = shardData;
    this.redrawFn = redrawFn;

    // Center the player on the map by default
    this.position = {
      x: Math.floor((settings.worldWidth || shardData.width) / 2),
      y: Math.floor((settings.worldHeight || shardData.height) / 2)
    };

    // Preload token images
    const loadPromises = Object.entries(TOKEN_PATHS).map(async ([key, path]) => {
      const img = new Image();
      img.src = path;
      await new Promise(resolve => (img.onload = resolve));
      this.tokenImages[key] = img;
    });
    await Promise.all(loadPromises);

    // Set initial token based on starting tile biome
    this.setTokenForCurrentTile();
  },

  /**
   * Determine token key for current tile and set it
   */
  setTokenForCurrentTile() {
    const { x, y } = this.position;
    const tile = this.shardData.tiles[y]?.[x];
    const key = BIOME_TOKEN_MAP[tile?.biome] || 'boat';
    this.activeToken = key;
  },

  /**
   * Get the active token image to draw
   */
  get activeTokenImage() {
    return this.tokenImages[this.activeToken] || null;
  },

  /**
   * Move the player by (dx, dy), clamp to bounds, switch token if needed, and redraw.
   * @param {number} dx
   * @param {number} dy
   */
  moveBy(dx, dy) {
    const maxX = this.shardData.width - 1;
    const maxY = this.shardData.height - 1;

    let nx = this.position.x + dx;
    let ny = this.position.y + dy;
    nx = Math.max(0, Math.min(maxX, nx));
    ny = Math.max(0, Math.min(maxY, ny));

    this.position = { x: nx, y: ny };

    // Auto-switch token based on new tile biome
    this.setTokenForCurrentTile();

    // Trigger a redraw of the entire scene
    this.redrawFn();
  },

  /**
   * Draw the player token on top of the map
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} originX
   * @param {number} originY
   */
  draw(ctx, originX, originY) {
    const img = this.activeTokenImage;
    if (!img) return;

    const { x, y } = this.position;
    const screenX = originX + (x - y) * (TILE_WIDTH / 2) - TILE_WIDTH / 2;
    const screenY = originY + (x + y) * (TILE_HEIGHT / 2) - TILE_HEIGHT;

    ctx.drawImage(img, screenX, screenY, TILE_WIDTH, TILE_HEIGHT);
  },
  getPosition() {
    return { x: this.x, y: this.y };
  },

  // Placeholder for future player-related state
  inventory: [],
  stats: {
    hp: 100,
    mana: 50
  },

  /**
   * Example action: player attack (expand as needed)
   * @param {object} target
   */
  attack(target) {
    console.log(`Player attacks ${target}`);
    // TODO: implement combat logic
    this.redrawFn();
  }
};
