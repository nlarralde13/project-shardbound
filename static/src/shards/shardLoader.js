// static/src/shards/shardLoader.js

import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';

/**
 * Fetches the initial shard JSON, sizes the canvas to fit,
 * and centers the scroll on the wrapper.
 *
 * @param {HTMLCanvasElement} canvas - The drawing canvas
 * @param {HTMLElement} wrapper      - Scroll container
 * @returns {Promise<{data: Object, ctx: CanvasRenderingContext2D}>}
 */
export async function loadAndSizeShard(canvas, wrapper) {
  const response = await fetch('/static/public/shards/shard_0_0.json');
  if (!response.ok) throw new Error(`Failed to load shard: ${response.statusText}`);
  const data = await response.json();

  // Size the canvas to fit the entire shard
  canvas.width  = data.width  * TILE_WIDTH;
  canvas.height = data.height * TILE_HEIGHT + TILE_HEIGHT;

  // Center initial scroll position
  wrapper.scrollLeft = (canvas.width - wrapper.clientWidth) / 2;
  wrapper.scrollTop  = (canvas.height - wrapper.clientHeight) / 2;

  const ctx = canvas.getContext('2d');
  return { data, ctx };
}

/**
 * Saves the given shard data as a JSON file download.
 *
 * @param {Object} shardData - The shard object to serialize
 */
export function saveShard(shardData) {
  const blob = new Blob([JSON.stringify(shardData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'shard.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reads a file input and parses it as shard JSON.
 *
 * @param {File} file - The uploaded JSON file
 * @returns {Promise<Object>} Resolves with the parsed shard object
 */
export function loadShardFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid shard JSON: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('File read error: ' + reader.error));
    reader.readAsText(file);
  });
}

/**
 * Requests a regenerated shard from the backend using provided settings.
 *
 * @param {Object} settings - Configuration for regeneration
 * @returns {Promise<Object>} Resolves with the new shard object
 */
export function regenerateShard(settings) {
  return fetch('/api/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Regeneration failed: ${response.statusText}`);
    }
    return response.json();
  });
}
