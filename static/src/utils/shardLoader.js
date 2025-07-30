// static/src/utils/shardLoader.js
import { renderShard } from '../shards/renderShard.js';

export function saveShard(shard) {
  const dataStr = JSON.stringify(shard, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'shard_0_0.json';
  a.click();

  URL.revokeObjectURL(url);
}

export function loadShardFromFile(file, onLoad) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const newShard = JSON.parse(e.target.result);
      console.log("[ShardLoader] ✅ Loaded shard from file");
      onLoad(newShard);
    } catch (err) {
      console.error("[ShardLoader] ❌ Failed to load shard:", err);
    }
  };
  reader.readAsText(file);
}

export async function regenerateShard(settings, renderCallback) {
  try {
    const res = await fetch('/static/public/shards/shard_0_0.json');
    const shard = await res.json();
    console.log("[ShardLoader] 🔄 Regenerated from default shard");
    renderCallback(shard);
  } catch (err) {
    console.error("[ShardLoader] ❌ Failed to regenerate shard:", err);
  }
}
