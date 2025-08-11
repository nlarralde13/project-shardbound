// shards/generateRoom.js
export function generateRoom({ sid, tx, ty, kind='room', name }) {
  const displayName = name || (kind==='inn' ? 'The Silver Flask Inn' : kind.toUpperCase());
  return {
    id: `room:${sid}:${tx},${ty}`,
    type: 'room',
    parent: { sid, tx, ty },
    name: displayName,
    desc: kind==='inn'
      ? 'Warm lanternlight spills across oak tables. The innkeeper polishes a mug and nods.'
      : 'A quiet room. Dust hangs in sunbeams.',
    tags: [kind],
  };
}
