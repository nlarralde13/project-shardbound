// static/src/utils/mouseUtils.js

export function getTransformedCoords(e, canvas, wrapper, scale) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left + wrapper.scrollLeft) / scale;
  const y = (e.clientY - rect.top  + wrapper.scrollTop)  / scale;
  return { x, y };
}