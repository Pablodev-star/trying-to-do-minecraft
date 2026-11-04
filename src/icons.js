// Item icons for the GUI: isometric block renders and item sprites, all drawn from our own textures.
import { BLOCKS, ITEMS } from './registry.js';
import { tileCanvas, itemSpriteCanvas } from './textures.js';

const cache = new Map();
const SIZE = 32;

function tinted(src, color) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color; g.fillRect(0, 0, 16, 16);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(src, 0, 0);
  return c;
}
function texCanvas(b, side) {
  const t = b.tex;
  const name = typeof t === 'string' ? t : side === 'top' ? t.top : side === 'front' ? (b.orient ? t.front : t.side) : t.side;
  let c = tileCanvas(name);
  if (b.tint && (b.tint !== 'grass_top' || side === 'top')) c = tinted(c, b.tint.startsWith('foliage') ? (b.tint === 'foliage_spruce' ? '#619961' : b.tint === 'foliage_birch' ? '#80a755' : '#59ae30') : b.tint === 'water' ? '#3f76e4' : '#79c05a');
  return c;
}

export function iconFor(id) {
  if (cache.has(id)) return cache.get(id);
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const it = ITEMS[id];
  const sprite = it && itemSpriteCanvas(it.name);
  const b = id < 256 ? BLOCKS[id] : null;
  if (sprite) g.drawImage(sprite, 0, 0, SIZE, SIZE);
  else if (b && (b.render === 'cross' || b.name === 'torch' || b.name === 'soul_torch' || b.name === 'ladder' || b.name === 'oak_door')) {
    const name = typeof b.tex === 'string' ? b.tex : b.tex.side;
    let tc = tileCanvas(name);
    if (b.tint) tc = tinted(tc, '#79c05a');
    g.drawImage(tc, 0, 0, SIZE, SIZE);
  } else if (b) {
    // isometric cube: top, left (front), right (side)
    const top = texCanvas(b, 'top'), left = texCanvas(b, 'front'), right = texCanvas(b, 'side');
    const h = b.box ? (b.box[4] - b.box[1]) / 16 : 1;
    const s = SIZE / 32;
    const yoff = (1 - h) * 8 * s;
    // top face
    g.save();
    g.setTransform(1 * s, 0.5 * s, -1 * s, 0.5 * s, 16 * s, 0 + yoff * 2);
    g.drawImage(top, 0, 0, 16, 16);
    g.restore();
    // left face
    g.save();
    g.setTransform(1 * s, 0.5 * s, 0, 1 * s, 0, 8 * s + yoff * 2);
    g.drawImage(left, 0, 16 * (1 - h), 16, 16 * h, 0, 0, 16, 16 * h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 16, 16 * h);
    g.restore();
    // right face
    g.save();
    g.setTransform(1 * s, -0.5 * s, 0, 1 * s, 16 * s, 16 * s + yoff * 2);
    g.drawImage(right, 0, 16 * (1 - h), 16, 16 * h, 0, 0, 16, 16 * h);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 16, 16 * h);
    g.restore();
  }
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
