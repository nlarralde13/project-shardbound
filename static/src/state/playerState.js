// Central player state with tiny pub/sub

export const playerState = {
  x: 0,
  y: 0,
  shardId: null,
};

let _subs = [];

export function onPlayerChange(fn) {
  _subs.push(fn);
  return () => { _subs = _subs.filter(f => f !== fn); };
}

function notify() {
  const snap = { ...playerState };
  _subs.forEach(fn => fn(snap));
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function initPlayerForShard(shard) {
  if (!shard) return;
  playerState.shardId = shard.id || shard.shardID || null;

  // If out of bounds (or first boot), start near center
  if (
    playerState.x < 0 || playerState.y < 0 ||
    playerState.x >= shard.width || playerState.y >= shard.height
  ) {
    playerState.x = Math.floor(shard.width / 2);
    playerState.y = Math.floor(shard.height / 2);
  }
  notify();
}

export function setPlayerPosition(x, y, shard) {
  if (shard) {
    x = clamp(x, 0, shard.width - 1);
    y = clamp(y, 0, shard.height - 1);
  }
  playerState.x = x;
  playerState.y = y;
  notify();
}

export function movePlayerBy(dx, dy, shard) {
  setPlayerPosition(playerState.x + dx, playerState.y + dy, shard);
}
