export async function loadImages(map) {
  const entries = Object.entries(map);
  const out = {};
  await Promise.all(entries.map(([key, src]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { out[key] = img; resolve(); };
    img.onerror = reject;
    img.src = src;
  })));
  return out;
}
