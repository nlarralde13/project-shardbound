// static/src/shards/shardLoader.js

import { generateRandomShard } from './rdmShardGen.js';
import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';

/**
 * Loads the initial shard JSON and sizes the canvas+wrapper.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} wrapper
 * @param {string} url Optional URL to fetch (defaults to shard_0_0.json)
 */
export async function loadAndSizeShard(canvas, wrapper, url = '/static/public/shards/shard_0_0.json') {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load shard: ${resp.statusText}`);
  const data = await resp.json();

  // size canvas
  canvas.width  = data.width  * TILE_WIDTH;
  canvas.height = data.height * TILE_HEIGHT + TILE_HEIGHT;

  // center scroll
  wrapper.scrollLeft = (canvas.width  - wrapper.clientWidth)  / 2;
  wrapper.scrollTop  = (canvas.height - wrapper.clientHeight) / 2;

  const ctx = canvas.getContext('2d');
  return { data, ctx };
}

/**
 * Save the given shard data as a JSON file download.
 * @param {Object} shardData
 * @param {string} filename Optional filename (defaults to shard.json)
 */
export function saveShard(shardData, filename = 'shard.json') {
  const blob = new Blob([JSON.stringify(shardData, null, 2)], {
    type: 'application/json'
  });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse a user-provided JSON file into a shard object.
 * @param {File} file
 * @returns {Promise<Object>}
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
 * Generate a brand-new random shard entirely on the client,
 * using your rdmShardGen logic.
 * @param {Object} settings
 * @returns {Promise<Object>} Resolves with the new shard object
 */
export function regenerateShard(settings) {
  // If you later move to a server API, you can switch this out.
  // For now we just call the random generator directly.
  return Promise.resolve(generateRandomShard(settings));
}
