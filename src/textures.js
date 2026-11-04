// Procedural 16x16 pixel-art textures, painted from scratch in code.
// Builds a block atlas (for the world mesh) and per-item sprite canvases (for the GUI).
import { hashString, mulberry32 } from './noise.js';

const S = 16;
export const ATLAS_TILES = 32; // 32x32 tiles
export const ATLAS_SIZE = S * ATLAS_TILES;

// ---------------------------------------------------------------- helpers
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function shade(c, f) { return [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)]; }
function mix(a, b, t) { return [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)]; }

class Tex {
  constructor(seedName) {
    this.d = new Uint8ClampedArray(S * S * 4);
    this.r = mulberry32(hashString(seedName));
  }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) { const i = (y * S + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  alpha(x, y) { if (x < 0 || y < 0 || x >= S || y >= S) return 0; return this.d[(y * S + x) * 4 + 3]; }
  fill(c, varAmt = 0, a = 255) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const f = 1 + (this.r() - 0.5) * varAmt;
      this.set(x, y, shade(c, f), a);
    }
    return this;
  }
  speckle(c, chance, varAmt = 0.1) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (this.r() < chance) this.set(x, y, shade(c, 1 + (this.r() - 0.5) * varAmt));
    }
    return this;
  }
  rect(x0, y0, w, h, c, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a); return this; }
  border(c, a = 255) { for (let i = 0; i < S; i++) { this.set(i, 0, c, a); this.set(i, 15, c, a); this.set(0, i, c, a); this.set(15, i, c, a); } return this; }
  bevel(light, dark) {
    for (let i = 0; i < S; i++) { this.set(i, 0, light); this.set(0, i, light); this.set(i, 15, dark); this.set(15, i, dark); }
    return this;
  }
  clear() { this.d.fill(0); return this; }
  // ascii mask: chars mapped to colors via palette object; '.' transparent
  mask(rows, pal) {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch !== '.' && pal[ch]) this.set(x, y, pal[ch]);
    }
    return this;
  }
  // add dark outline around opaque pixels (item style)
  outline(c) {
    const o = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (this.alpha(x, y)) continue;
      if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) o.push([x, y]);
    }
    for (const [x, y] of o) this.set(x, y, c);
    return this;
  }
  // shade edges of opaque region: lighter top-left, darker bottom-right
  relief(hi = 1.25, lo = 0.7) {
    const cp = new Uint8ClampedArray(this.d);
    const a = (x, y) => (x < 0 || y < 0 || x >= S || y >= S) ? 0 : cp[(y * S + x) * 4 + 3];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!a(x, y)) continue;
      const i = (y * S + x) * 4;
      const c = [cp[i], cp[i + 1], cp[i + 2]];
      if (!a(x, y - 1) || !a(x - 1, y)) this.set(x, y, shade(c, hi));
      else if (!a(x, y + 1) || !a(x + 1, y)) this.set(x, y, shade(c, lo));
    }
    return this;
  }
  ellipse(cx, cy, rx, ry, c, varAmt = 0) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, shade(c, 1 + (this.r() - 0.5) * varAmt));
    }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
    return this;
  }
}

// ---------------------------------------------------------------- block textures
const C = {
  stone: hex(0x7d7d7d), dirt: hex(0x866043), sand: hex(0xdbcfa0), cobble: hex(0x7a7a7a),
};

function noiseTex(name, base, v = 0.18, extra) {
  const t = new Tex(name).fill(hex(base), v);
  if (extra) extra(t);
  return t;
}
function stone(t) {
  t.fill(C.stone, 0.12);
  for (let i = 0; i < 6; i++) {
    const x = (t.r() * 14) | 0, y = (t.r() * 16) | 0, l = 2 + ((t.r() * 3) | 0);
    for (let k = 0; k < l; k++) t.set(x + k, y, shade(C.stone, 0.82));
  }
  t.speckle(hex(0x939393), 0.08);
  return t;
}
function ore(name, color, base = 'stone') {
  const t = new Tex(name);
  if (base === 'stone') stone(t); else if (base === 'nether') netherrack(t); else if (base === 'deep') t.fill(hex(0x4a4a50), 0.15);
  const c = hex(color);
  const spots = [[3, 3], [10, 2], [6, 8], [12, 10], [3, 12], [9, 13]];
  for (const [sx, sy] of spots) {
    if (t.r() < 0.25) continue;
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
    for (const [dx, dy] of pts) if (t.r() < 0.8) t.set(sx + dx, sy + dy, shade(c, 0.85 + t.r() * 0.35));
    t.set(sx, sy, shade(c, 1.35));
    t.set(sx + 1, sy + 2, shade(c, 0.6));
  }
  return t;
}
function netherrack(t) {
  t.fill(hex(0x6f3534), 0.25);
  t.speckle(hex(0x4f2121), 0.15).speckle(hex(0x8c4a46), 0.08);
  return t;
}
function cobble(t, base = C.cobble) {
  t.fill(shade(base, 0.6), 0.1);
  for (let i = 0; i < 9; i++) {
    const cx = t.r() * 16, cy = t.r() * 16, rx = 2 + t.r() * 2.5, ry = 1.6 + t.r() * 2;
    const col = shade(base, 0.85 + t.r() * 0.4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx > 8) dx -= 16; if (dx < -8) dx += 16; if (dy > 8) dy -= 16; if (dy < -8) dy += 16;
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (d < 0.75) t.set(x, y, shade(col, 1 + (t.r() - 0.5) * 0.1));
      else if (d < 1) t.set(x, y, shade(col, 0.75));
    }
  }
  return t;
}
function planks(name, color) {
  const c = hex(color);
  const t = new Tex(name).fill(c, 0.08);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (t.r() < 0.18) t.set(x, y, shade(c, 0.9));
  }
  for (let row = 0; row < 4; row++) {
    const y = row * 4 + 3;
    for (let x = 0; x < S; x++) t.set(x, y, shade(c, 0.62));
    const off = row % 2 ? 4 : 12;
    t.set(off, y - 1, shade(c, 0.7)); t.set(off, y - 2, shade(c, 0.7)); t.set(off, y - 3, shade(c, 0.75));
  }
  return t;
}
function logSide(name, bark, stripe = 0.7) {
  const c = hex(bark);
  const t = new Tex(name).fill(c, 0.12);
  for (let x = 0; x < S; x++) {
    if (t.r() < 0.4) for (let y = 0; y < S; y++) if (t.r() < 0.75) t.set(x, y, shade(c, stripe + t.r() * 0.1));
  }
  return t;
}
function birchSide(name) {
  const t = new Tex(name).fill(hex(0xd8d5c9), 0.06);
  for (let i = 0; i < 8; i++) {
    const x = (t.r() * 14) | 0, y = (t.r() * 16) | 0, w = 2 + ((t.r() * 3) | 0);
    for (let k = 0; k < w; k++) t.set(x + k, y, hex(0x3b3b36));
    if (t.r() < 0.5) t.set(x + 1, y + 1, hex(0x575750));
  }
  return t;
}
function logTop(name, inner, bark) {
  const ci = hex(inner), cb = hex(bark);
  const t = new Tex(name);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) t.set(x, y, shade(cb, 0.9 + t.r() * 0.2));
    else t.set(x, y, shade(ci, (Math.floor(d) % 2 ? 0.86 : 1.0) + (t.r() - 0.5) * 0.06));
  }
  return t;
}
function leaves(name, shadeVal = 1, holes = 0.12) {
  const t = new Tex(name);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (t.r() < holes) continue;
    const v = (105 + t.r() * 85) * shadeVal;
    t.set(x, y, [v, v, v]);
  }
  return t;
}
function wool(name, color) {
  const c = hex(color);
  const t = new Tex(name).fill(c, 0.06);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + y * 3) % 5 === 0) t.set(x, y, shade(c, 0.9));
  return t;
}
function mineral(name, color, pattern) {
  const c = hex(color);
  const t = new Tex(name).fill(c, 0.08);
  t.bevel(shade(c, 1.3), shade(c, 0.65));
  for (let i = 1; i < 15; i++) { t.set(i, 1, shade(c, 1.15)); t.set(1, i, shade(c, 1.15)); t.set(i, 14, shade(c, 0.8)); t.set(14, i, shade(c, 0.8)); }
  if (pattern) pattern(t, c);
  return t;
}
function bricks(name, brick, mortar, h = 4, w = 8) {
  const cb = hex(brick), cm = hex(mortar);
  const t = new Tex(name);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / h);
    const off = row % 2 ? w / 2 : 0;
    if (y % h === h - 1 || (x + off) % w === w - 1) t.set(x, y, shade(cm, 1 + (t.r() - 0.5) * 0.1));
    else t.set(x, y, shade(cb, 1 + (t.r() - 0.5) * 0.18));
  }
  return t;
}
function cross(name, draw) { const t = new Tex(name); draw(t); return t; }
function plantStalks(t, colors, height, n = 6) {
  for (let i = 0; i < n; i++) {
    const x = 1 + ((i * 13 + (t.r() * 4) | 0) % 14);
    const h = Math.max(2, Math.round(height * (0.6 + t.r() * 0.4)));
    for (let k = 0; k < h; k++) {
      const c = colors[Math.min(colors.length - 1, Math.floor(k / h * colors.length))];
      t.set(x + (k > h * 0.6 && i % 2 ? 1 : 0), 15 - k, shade(c, 0.9 + t.r() * 0.2));
    }
  }
}
function flower(name, petal, center, stem = 0x3f7b22) {
  return cross(name, (t) => {
    for (let y = 8; y < 16; y++) t.set(7, y, hex(stem));
    t.set(6, 11, hex(stem)); t.set(5, 10, hex(stem)); t.set(8, 13, hex(stem)); t.set(9, 12, hex(stem));
    const p = hex(petal);
    for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [-1, 0], [1, 0], [0, 1]]) t.set(7 + dx, 5 + dy, shade(p, 0.85 + t.r() * 0.3));
    t.set(7, 5, hex(center));
  });
}
function sapling(name, leaf, trunk) {
  return cross(name, (t) => {
    for (let y = 9; y < 16; y++) t.set(7, y, hex(trunk));
    t.ellipse(7.5, 6, 5, 4.5, hex(leaf), 0.4);
    for (let i = 0; i < 12; i++) t.set((t.r() * 16) | 0, (t.r() * 10) | 0, [0, 0, 0], 0);
  });
}
function crack(stage) {
  const t = new Tex('destroy');
  const r = mulberry32(777);
  const lines = [];
  for (let i = 0; i < 12; i++) lines.push([r() * 16, r() * 16, (r() - 0.5) * 2, (r() - 0.5) * 2]);
  const n = Math.min(12, 2 + stage * 1.2);
  for (let i = 0; i < n; i++) {
    let [x, y, dx, dy] = lines[i];
    const len = 3 + stage * 0.8;
    for (let k = 0; k < len; k++) {
      t.set(x | 0, y | 0, [20, 20, 20], 200);
      x += dx; y += dy;
      dx += (r() - 0.5) * 0.6; dy += (r() - 0.5) * 0.6;
    }
  }
  return t;
}

export const WOOL_COLORS = {
  white: 0xe9ecec, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c627, lime: 0x70b919,
  pink: 0xed8dac, gray: 0x3e4447, light_gray: 0x8e8e86, cyan: 0x158991, purple: 0x792aac, blue: 0x35399d,
  brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519,
};

const blockTexDefs = {
  stone: () => stone(new Tex('stone')),
  granite: () => noiseTex('granite', 0x956755, 0.2, (t) => t.speckle(hex(0xb48a77), 0.15).speckle(hex(0x6e4636), 0.08)),
  diorite: () => noiseTex('diorite', 0xbdbdbd, 0.1, (t) => t.speckle(hex(0x7e7e7e), 0.12).speckle(hex(0xe8e8e8), 0.1)),
  andesite: () => noiseTex('andesite', 0x888889, 0.15, (t) => t.speckle(hex(0x6d6d6d), 0.15).speckle(hex(0xa0a0a0), 0.08)),
  dirt: () => noiseTex('dirt', 0x866043, 0.2, (t) => t.speckle(hex(0x5f4430), 0.12).speckle(hex(0x9a7656), 0.08)),
  grass_top: () => { const t = new Tex('gt'); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 125 + t.r() * 70; t.set(x, y, [v, v, v]); } return t; },
  grass_side: () => {
    const t = blockTexDefs.dirt();
    const g = hex(0x7aa847);
    for (let x = 0; x < S; x++) {
      const h = 3 + ((t.r() * 2.2) | 0);
      for (let y = 0; y < h; y++) t.set(x, y, shade(g, 0.85 + t.r() * 0.3));
    }
    return t;
  },
  snowy_grass_side: () => {
    const t = blockTexDefs.dirt();
    for (let x = 0; x < S; x++) { const h = 3 + ((t.r() * 2.2) | 0); for (let y = 0; y < h; y++) t.set(x, y, shade(hex(0xf2f6f6), 0.92 + t.r() * 0.08)); }
    return t;
  },
  podzol_top: () => noiseTex('podzol', 0x5b3e1e, 0.25, (t) => t.speckle(hex(0x7a5530), 0.2)),
  cobblestone: () => cobble(new Tex('cobble')),
  mossy_cobblestone: () => { const t = cobble(new Tex('mcobble')); for (let i = 0; i < 40; i++) { const x = (t.r() * 16) | 0, y = (t.r() * 16) | 0; t.set(x, y, shade(hex(0x5a7a30), 0.8 + t.r() * 0.4)); t.set(x + 1, y, shade(hex(0x4a6a28), 1)); } return t; },
  oak_planks: () => planks('oakp', 0xa2834f),
  spruce_planks: () => planks('sprp', 0x725430),
  birch_planks: () => planks('birp', 0xc4b077),
  jungle_planks: () => planks('junp', 0xa07351),
  acacia_planks: () => planks('acap', 0xa8582f),
  oak_log: () => logSide('oakl', 0x6b5233),
  oak_log_top: () => logTop('oaklt', 0xb08f5a, 0x6b5233),
  spruce_log: () => logSide('sprl', 0x3d2a17, 0.75),
  spruce_log_top: () => logTop('sprlt', 0x7a5a36, 0x3d2a17),
  birch_log: () => birchSide('birl'),
  birch_log_top: () => logTop('birlt', 0xc8b77f, 0xd8d5c9),
  jungle_log: () => logSide('junl', 0x56441c),
  jungle_log_top: () => logTop('junlt', 0xae8456, 0x56441c),
  acacia_log: () => logSide('acal', 0x676157),
  acacia_log_top: () => logTop('acalt', 0xb05d33, 0x676157),
  oak_leaves: () => leaves('oakle'),
  spruce_leaves: () => leaves('sprle', 0.85, 0.08),
  birch_leaves: () => leaves('birle', 1.0, 0.1),
  jungle_leaves: () => leaves('junle', 1.0, 0.06),
  acacia_leaves: () => leaves('acale', 0.95, 0.14),
  bedrock: () => noiseTex('bedrock', 0x565656, 0.7, (t) => t.speckle(hex(0x222222), 0.25).speckle(hex(0x9a9a9a), 0.1)),
  sand: () => noiseTex('sand', 0xdbcfa0, 0.1, (t) => t.speckle(hex(0xc9b98a), 0.15).speckle(hex(0xe8dfb8), 0.1)),
  red_sand: () => noiseTex('rsand', 0xbe6621, 0.12, (t) => t.speckle(hex(0xa45619), 0.15)),
  gravel: () => { const t = new Tex('gravel').fill(hex(0x857f7c), 0.2); for (let i = 0; i < 30; i++) { const x = (t.r() * 16) | 0, y = (t.r() * 16) | 0; const c = t.r() < 0.5 ? hex(0x5d5755) : hex(0xa8a39f); t.set(x, y, c); t.set(x + 1, y, shade(c, 0.85)); t.set(x, y + 1, shade(c, 0.75)); } return t; },
  coal_ore: () => ore('coalo', 0x2b2b2b),
  iron_ore: () => ore('irono', 0xd8af93),
  copper_ore: () => ore('coppero', 0xe0734d),
  gold_ore: () => ore('goldo', 0xfcee4b),
  redstone_ore: () => ore('redo', 0xff0000),
  lapis_ore: () => ore('lapiso', 0x1e4fbf),
  diamond_ore: () => ore('diao', 0x5decf5),
  emerald_ore: () => ore('emeo', 0x17dd62),
  nether_quartz_ore: () => ore('qo', 0xeae4dc, 'nether'),
  nether_gold_ore: () => ore('ngo', 0xfcee4b, 'nether'),
  glass: () => { const t = new Tex('glass').clear(); t.border(hex(0xdbf0f5)); t.line(3, 4, 6, 1, hex(0xffffff)); t.line(4, 5, 5, 4, hex(0xffffff)); t.line(10, 12, 12, 10, hex(0xffffff)); return t; },
  lapis_block: () => mineral('lapb', 0x1f45a8, (t, c) => t.speckle(shade(c, 1.4), 0.08)),
  sandstone: () => { const t = noiseTex('ss', 0xd8cb94, 0.06); for (let x = 0; x < S; x++) { t.set(x, 4, hex(0xc9b980)); t.set(x, 10, hex(0xc9b980)); } return t; },
  sandstone_top: () => noiseTex('sst', 0xddd29e, 0.05),
  gold_block: () => mineral('goldb', 0xf5d232),
  iron_block: () => mineral('ironb', 0xdcdcdc),
  diamond_block: () => mineral('diab', 0x62e8db),
  emerald_block: () => mineral('emeb', 0x2ad467),
  coal_block: () => mineral('coalb', 0x1d1d1d, (t) => t.speckle(hex(0x333333), 0.2)),
  redstone_block: () => mineral('redb', 0xb11c08, (t, c) => t.speckle(shade(c, 1.35), 0.15)),
  copper_block: () => mineral('copb', 0xc06c50, (t, c) => t.speckle(shade(c, 1.2), 0.1)),
  quartz_block: () => mineral('qb', 0xece6df),
  bricks: () => bricks('bricks', 0x96513f, 0xa49a90),
  stone_bricks: () => bricks('stoneb', 0x7d7d7d, 0x5b5b5b, 8, 16),
  mossy_stone_bricks: () => { const t = bricks('mstoneb', 0x7a7a72, 0x585858, 8, 16); t.speckle(hex(0x5f7b33), 0.18); return t; },
  smooth_stone: () => { const t = noiseTex('smooth', 0x9e9e9e, 0.05); t.border(hex(0x777777)); return t; },
  nether_bricks: () => bricks('nb', 0x2f1619, 0x160b0d, 4, 8),
  red_nether_bricks: () => bricks('rnb', 0x4a0709, 0x2a0405, 4, 8),
  end_stone_bricks: () => bricks('esb', 0xdee3a5, 0xb7ba82, 8, 16),
  tnt_side: () => { const t = noiseTex('tnts', 0xdb441a, 0.1); t.rect(0, 5, 16, 6, hex(0xe8e8e8)); const k = hex(0x222222); for (const x of [2, 3, 4, 7, 8, 11, 12, 13]) t.set(x, 6, k); t.rect(3, 7, 1, 3, k); t.rect(7, 7, 1, 3, k); t.rect(9, 7, 1, 3, k); t.set(8, 7, k); t.rect(12, 7, 1, 3, k); for (let x = 0; x < 16; x += 2) { t.set(x, 0, hex(0x9e2f12)); t.set(x, 15, hex(0x9e2f12)); } return t; },
  tnt_top: () => { const t = noiseTex('tntt', 0xc9431c, 0.1); t.rect(6, 6, 4, 4, hex(0xe8e8e8)); t.rect(7, 7, 2, 2, hex(0x333333)); return t; },
  tnt_bottom: () => noiseTex('tntb', 0xb33b18, 0.12),
  bookshelf: () => {
    const t = planks('bsh', 0xa2834f);
    const cols = [0x8d2a20, 0x2b5a2e, 0x2a3d86, 0x7a5a1e, 0x6b2a6e, 0xc4a043];
    for (const y0 of [1, 9]) for (let x = 1; x < 15; x++) {
      const c = hex(cols[(t.r() * cols.length) | 0]); const h = 5 + ((t.r() * 2) | 0);
      for (let y = y0 + (6 - h); y < y0 + 6; y++) t.set(x, y, shade(c, y === y0 + (6 - h) ? 1.2 : 1));
    }
    return t;
  },
  obsidian: () => noiseTex('obs', 0x140f20, 0.3, (t) => t.speckle(hex(0x3b2a5a), 0.12).speckle(hex(0x060408), 0.15)),
  crying_obsidian: () => noiseTex('cobs', 0x140f20, 0.3, (t) => t.speckle(hex(0x8a2bdc), 0.12)),
  torch: () => { const t = new Tex('torch').clear(); for (let y = 6; y < 16; y++) { t.set(7, y, hex(0x6b4a26)); t.set(8, y, hex(0x8a6436)); } t.rect(7, 4, 2, 2, hex(0xffd84a)); t.set(7, 3, hex(0xfff2a0)); t.set(8, 5, hex(0xff9a1a)); return t; },
  soul_torch: () => { const t = new Tex('storch').clear(); for (let y = 6; y < 16; y++) { t.set(7, y, hex(0x6b4a26)); t.set(8, y, hex(0x8a6436)); } t.rect(7, 4, 2, 2, hex(0x6fe8ff)); t.set(7, 3, hex(0xd0faff)); return t; },
  crafting_table_top: () => { const t = planks('ctt', 0xa2834f); t.border(hex(0x6b5233)); for (let i = 1; i < 15; i++) { t.set(i, 5, hex(0x5a4128)); t.set(i, 10, hex(0x5a4128)); t.set(5, i, hex(0x5a4128)); t.set(10, i, hex(0x5a4128)); } return t; },
  crafting_table_side: () => { const t = planks('cts', 0x8c6c3e); t.rect(0, 0, 16, 2, hex(0x6b5233)); t.rect(3, 4, 1, 8, hex(0x7a7a7a)); t.rect(2, 4, 3, 2, hex(0x9a9a9a)); t.rect(11, 5, 1, 8, hex(0x6b4a26)); t.rect(10, 4, 3, 2, hex(0x8a8a8a)); return t; },
  crafting_table_front: () => { const t = planks('ctf', 0x8c6c3e); t.rect(0, 0, 16, 2, hex(0x6b5233)); t.rect(4, 4, 8, 1, hex(0x5a4128)); t.rect(5, 6, 1, 7, hex(0x7a7a7a)); t.rect(10, 6, 1, 7, hex(0x6b4a26)); t.rect(9, 5, 3, 2, hex(0xb5b5b5)); return t; },
  furnace_side: () => { const t = cobble(new Tex('fs'), hex(0x8a8a8a)); return t; },
  furnace_top: () => { const t = noiseTex('ft', 0x6e6e6e, 0.1); t.border(hex(0x555555)); return t; },
  furnace_front: () => { const t = cobble(new Tex('ff'), hex(0x8a8a8a)); t.rect(4, 8, 8, 5, hex(0x1b1b1b)); t.rect(3, 7, 10, 1, hex(0x5a5a5a)); t.rect(4, 3, 8, 2, hex(0x5a5a5a)); return t; },
  furnace_front_on: () => { const t = cobble(new Tex('ff'), hex(0x8a8a8a)); t.rect(4, 8, 8, 5, hex(0x2b1b0b)); for (let x = 4; x < 12; x++) for (let y = 10; y < 13; y++) t.set(x, y, t.r() < 0.5 ? hex(0xffa020) : hex(0xffd84a)); t.rect(3, 7, 10, 1, hex(0x5a5a5a)); t.rect(4, 3, 8, 2, hex(0x5a5a5a)); return t; },
  chest_top: () => { const t = planks('cht', 0xa0702c); t.border(hex(0x3a2810)); return t; },
  chest_side: () => { const t = planks('chs', 0x9a6a28); t.border(hex(0x3a2810)); for (let x = 0; x < 16; x++) t.set(x, 5, hex(0x3a2810)); return t; },
  chest_front: () => { const t = blockTexDefs.chest_side(); t.rect(7, 4, 2, 4, hex(0xc8c8c8)); t.set(7, 7, hex(0x555555)); return t; },
  farmland: () => { const t = noiseTex('farm', 0x5a3a20, 0.2); for (let y = 1; y < 16; y += 4) for (let x = 0; x < 16; x++) t.set(x, y, hex(0x3d2614)); t.border(hex(0x4a3018)); return t; },
  farmland_wet: () => { const t = noiseTex('farmw', 0x3c2412, 0.2); for (let y = 1; y < 16; y += 4) for (let x = 0; x < 16; x++) t.set(x, y, hex(0x26160a)); t.border(hex(0x2e1c0c)); return t; },
  snow: () => noiseTex('snow', 0xf2f8f8, 0.04, (t) => t.speckle(hex(0xdbe6ec), 0.1)),
  ice: () => { const t = noiseTex('ice', 0x8fb5f5, 0.08); t.line(2, 13, 9, 6, hex(0xc8dcff)); t.line(9, 14, 14, 9, hex(0xc8dcff)); return t; },
  packed_ice: () => noiseTex('pice', 0x8db0ea, 0.06, (t) => t.speckle(hex(0xb3cbf5), 0.1)),
  cactus_side: () => { const t = noiseTex('cacs', 0x5a8a2a, 0.1); for (let y = 0; y < 16; y++) { t.set(1, y, hex(0x2f5a12)); t.set(14, y, hex(0x2f5a12)); t.set(5, y, hex(0x4a7a22)); t.set(10, y, hex(0x4a7a22)); } for (let y = 2; y < 16; y += 4) { t.set(0, y, hex(0x2a2a1a)); t.set(15, y + 2, hex(0x2a2a1a)); } return t; },
  cactus_top: () => { const t = noiseTex('cact', 0x6a9a34, 0.08); t.border(hex(0x3a6a1a)); t.rect(6, 6, 4, 4, hex(0x7aaa44)); return t; },
  clay: () => noiseTex('clay', 0xa2a7b4, 0.06, (t) => t.speckle(hex(0x8e93a0), 0.1)),
  terracotta: () => noiseTex('terra', 0x985e43, 0.06),
  sugar_cane: () => cross('cane', (t) => { for (const x of [3, 8, 12]) for (let y = 0; y < 16; y++) { t.set(x, y, shade(hex(0x9ad25e), 0.9 + t.r() * 0.2)); t.set(x + 1, y, shade(hex(0x76a942), 1)); if (y % 5 === 0) { t.set(x, y, hex(0xc8e89a)); t.set(x + 1, y, hex(0xb0d880)); } } }),
  pumpkin_side: () => { const t = noiseTex('pks', 0xc87518, 0.08); for (const x of [3, 7, 11]) for (let y = 0; y < 16; y++) t.set(x, y, hex(0xa25e10)); return t; },
  pumpkin_top: () => { const t = noiseTex('pkt', 0xc87518, 0.08); t.rect(7, 7, 2, 2, hex(0x5a7a2a)); return t; },
  pumpkin_face: () => { const t = blockTexDefs.pumpkin_side(); const k = hex(0x3a1e04); t.rect(3, 4, 3, 3, k); t.rect(10, 4, 3, 3, k); t.rect(4, 10, 8, 2, k); t.set(6, 9, k); t.set(9, 9, k); return t; },
  jack_o_lantern: () => { const t = blockTexDefs.pumpkin_side(); const k = hex(0xffd84a); t.rect(3, 4, 3, 3, k); t.rect(10, 4, 3, 3, k); t.rect(4, 10, 8, 2, k); t.set(6, 9, k); t.set(9, 9, k); return t; },
  melon_side: () => { const t = noiseTex('mels', 0x6f9a1f, 0.1); for (const x of [2, 6, 10, 14]) for (let y = 0; y < 16; y++) t.set(x, y, hex(0x9ac83a)); return t; },
  melon_top: () => noiseTex('melt', 0x7aa628, 0.15),
  netherrack: () => netherrack(new Tex('netherrack')),
  soul_sand: () => { const t = noiseTex('soul', 0x513e32, 0.2); for (let i = 0; i < 4; i++) { const x = 1 + ((t.r() * 11) | 0), y = 1 + ((t.r() * 11) | 0); t.set(x, y, hex(0x2a1e16)); t.set(x + 2, y, hex(0x2a1e16)); t.set(x + 1, y + 2, hex(0x2a1e16)); t.set(x, y + 3, hex(0x2a1e16)); t.set(x + 2, y + 3, hex(0x2a1e16)); } return t; },
  soul_soil: () => noiseTex('soil', 0x4b3a2e, 0.2),
  glowstone: () => { const t = noiseTex('glow', 0x8f6a3a, 0.2); for (let i = 0; i < 16; i++) t.ellipse(t.r() * 16, t.r() * 16, 1.5, 1.5, hex(0xffe2a0), 0.2); t.speckle(hex(0xfff6d0), 0.08); return t; },
  nether_portal: () => { const t = new Tex('portal'); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = Math.sin((x + y) * 0.9) * 0.5 + Math.sin(x * 0.6 - y * 1.1) * 0.5; t.set(x, y, mix(hex(0x5a10b8), hex(0xb05aff), (v + 1) / 2), 190); } return t; },
  magma_block: () => { const t = noiseTex('magma', 0x4a1e0a, 0.2); for (let i = 0; i < 12; i++) { const x = (t.r() * 16) | 0, y = (t.r() * 16) | 0; t.line(x, y, x + 3, y + ((t.r() * 3) | 0) - 1, hex(0xff8a1a)); } return t; },
  basalt: () => logSide('basalt', 0x4e4e52, 0.8),
  ancient_debris_side: () => { const t = noiseTex('ads', 0x5e4038, 0.2); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) if ((x + y) % 3) t.set(x, y, hex(0x4a302a)); t.speckle(hex(0x8a6a5a), 0.08); return t; },
  ancient_debris_top: () => { const t = noiseTex('adt', 0x5e4038, 0.2); t.ellipse(8, 8, 4, 4, hex(0x7a5a4a)); t.ellipse(8, 8, 2, 2, hex(0x4a302a)); return t; },
  blackstone: () => noiseTex('bs', 0x2a2428, 0.2, (t) => t.speckle(hex(0x3c3438), 0.15)),
  nether_wart_block: () => noiseTex('nwb', 0x7b0201, 0.25),
  crimson_nylium: () => noiseTex('cny', 0x8a1a1a, 0.25, (t) => t.speckle(hex(0xb02a2a), 0.15)),
  shroomlight: () => noiseTex('shroom', 0xf09a4a, 0.2, (t) => t.speckle(hex(0xffd08a), 0.2)),
  end_stone: () => noiseTex('es', 0xdee3a5, 0.06, (t) => { t.speckle(hex(0xc8cd8e), 0.15); for (let i = 0; i < 6; i++) t.set((t.r() * 16) | 0, (t.r() * 16) | 0, hex(0xb3b67a)); }),
  end_portal_frame_top: () => { const t = noiseTex('eft', 0x4a7a6a, 0.1); t.border(hex(0xd5d8a0)); t.rect(4, 4, 8, 8, hex(0x2a4a3e)); return t; },
  end_portal_frame_top_eye: () => { const t = blockTexDefs.end_portal_frame_top(); t.ellipse(8, 8, 3.5, 3.5, hex(0x2a8a5a)); t.rect(7, 6, 2, 4, hex(0x0a1a10)); return t; },
  end_portal_frame_side: () => { const t = noiseTex('efs', 0xdee3a5, 0.06); t.rect(0, 0, 16, 4, hex(0x4a7a6a)); for (let x = 0; x < 16; x += 3) t.set(x, 4, hex(0x2a5a4a)); return t; },
  end_portal: () => { const t = new Tex('ep').fill(hex(0x050a10), 0.3); t.speckle(hex(0x2a8a7a), 0.06).speckle(hex(0xc8f0ff), 0.03); return t; },
  purpur_block: () => mineral('purpur', 0xa77ca7),
  dragon_egg: () => noiseTex('degg', 0x0e0a14, 0.3, (t) => t.speckle(hex(0x3a1e4a), 0.15)),
  water: () => { const t = new Tex('water'); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 200 + Math.sin(x * 0.8 + y * 0.4) * 20 + t.r() * 25; t.set(x, y, [v, v, v], 175); } return t; },
  lava: () => { const t = new Tex('lava'); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = Math.sin(x * 0.7 + Math.cos(y * 0.5) * 2) + Math.cos(y * 0.6 + x * 0.2); t.set(x, y, mix(hex(0xd24a05), hex(0xffc43a), (v + 2) / 4 + (t.r() - 0.5) * 0.15)); } return t; },
  fire: () => cross('fire', (t) => { for (let x = 0; x < 16; x++) { const h = 6 + Math.abs(Math.sin(x * 1.7) * 7) + t.r() * 3; for (let y = 0; y < h; y++) { const f = y / h; t.set(x, 15 - y, f < 0.35 ? hex(0xffe8a0) : f < 0.7 ? hex(0xffa020) : hex(0xe0501a)); } } }),
  short_grass: () => cross('sg', (t) => { for (let i = 0; i < 9; i++) { const x = 1 + ((t.r() * 14) | 0); const h = 5 + ((t.r() * 9) | 0); for (let k = 0; k < h; k++) { const v = 150 + t.r() * 80; t.set(x + (k > h * 0.6 && i % 2 ? (i % 4 ? 1 : -1) : 0), 15 - k, [v, v, v]); } } }),
  fern: () => cross('fern', (t) => { for (let y = 2; y < 16; y++) { t.set(7, y, [180, 180, 180]); const w = Math.floor((16 - y) / 3); for (let k = 1; k <= w; k++) if (y % 2) { t.set(7 - k, y - (k >> 1), [200, 200, 200]); t.set(7 + k, y - (k >> 1), [190, 190, 190]); } } }),
  dead_bush: () => cross('db', (t) => { const c = hex(0x6b4a26); t.line(7, 15, 7, 9, c); t.line(7, 10, 3, 5, c); t.line(7, 11, 12, 4, c); t.line(5, 7, 5, 3, c); t.line(10, 6, 13, 7, c); t.line(7, 9, 8, 3, c); }),
  dandelion: () => flower('dand', 0xf8e02a, 0xd89a10),
  poppy: () => flower('poppy', 0xd8241a, 0x2a1a0a),
  cornflower: () => flower('corn', 0x4a6ad8, 0x2a3a8a),
  blue_orchid: () => flower('orch', 0x2ab2e8, 0xc8f0ff),
  allium: () => flower('allium', 0xb45ad8, 0xe0a0f0),
  oxeye_daisy: () => flower('oxeye', 0xe8e8e8, 0xf0d02a),
  oak_sapling: () => sapling('oaks', 0x4a8a20, 0x6b5233),
  spruce_sapling: () => sapling('sprs', 0x2a5a30, 0x3d2a17),
  birch_sapling: () => sapling('birs', 0x6aa040, 0xd8d5c9),
  brown_mushroom: () => cross('bm', (t) => { t.rect(7, 9, 2, 6, hex(0xd8c8a8)); t.ellipse(8, 8.5, 4, 2.2, hex(0x9a6e4e), 0.1); }),
  red_mushroom: () => cross('rm', (t) => { t.rect(7, 9, 2, 6, hex(0xd8c8a8)); t.ellipse(8, 8, 4, 2.8, hex(0xd8261e), 0.1); t.set(6, 7, hex(0xffffff)); t.set(9, 6, hex(0xffffff)); t.set(10, 8, hex(0xffffff)); }),
  cobweb: () => cross('web', (t) => { const c = hex(0xe8e8e8); t.line(0, 0, 15, 15, c); t.line(15, 0, 0, 15, c); t.line(8, 0, 8, 15, c); t.line(0, 8, 15, 8, c); for (const r of [3, 6]) { t.line(8 - r, 8, 8, 8 - r, c); t.line(8, 8 - r, 8 + r, 8, c); t.line(8 + r, 8, 8, 8 + r, c); t.line(8, 8 + r, 8 - r, 8, c); } }),
  ladder: () => { const t = new Tex('ladder').clear(); const c = hex(0x8a6436); for (let y = 0; y < 16; y++) { t.set(2, y, c); t.set(3, y, shade(c, 0.8)); t.set(12, y, c); t.set(13, y, shade(c, 0.8)); } for (const y of [2, 6, 10, 14]) for (let x = 2; x < 14; x++) t.set(x, y, x % 3 ? c : shade(c, 0.85)); return t; },
  hay_top: () => { const t = noiseTex('hayt', 0xc8a020, 0.15); t.border(hex(0x8a6a10)); return t; },
  hay_side: () => { const t = new Tex('hays').fill(hex(0xc8a020), 0.15); for (let x = 0; x < 16; x++) if (t.r() < 0.4) for (let y = 0; y < 16; y++) t.set(x, y, shade(hex(0xa08014), 1 + (t.r() - 0.5) * 0.2)); t.rect(0, 4, 16, 1, hex(0x7a2a10)); t.rect(0, 11, 16, 1, hex(0x7a2a10)); return t; },
  iron_bars: () => { const t = new Tex('bars').clear(); const c = hex(0x8a8a8a); for (const x of [1, 5, 9, 13]) for (let y = 0; y < 16; y++) { t.set(x, y, c); t.set(x + 1, y, shade(c, 0.7)); } for (let x = 0; x < 16; x++) { t.set(x, 0, c); t.set(x, 15, shade(c, 0.7)); } return t; },
  lantern: () => { const t = new Tex('lant').clear(); t.rect(5, 7, 6, 9, hex(0x3a3a42)); t.rect(6, 9, 4, 5, hex(0xffc860)); t.rect(7, 10, 2, 3, hex(0xfff0b0)); t.rect(6, 5, 4, 2, hex(0x2a2a30)); t.rect(7, 3, 2, 2, hex(0x5a5a5a)); return t; },
  lantern_top: () => { const t = new Tex('lantt').clear(); t.rect(5, 5, 6, 6, hex(0x3a3a42)); t.rect(7, 7, 2, 2, hex(0x5a5a5a)); return t; },
  bed_foot: () => { const t = new Tex('bedf').fill(hex(0xa82a2a), 0.06); for (let x = 0; x < 16; x++) t.set(x, 15, hex(0x7a1a1a)); return t; },
  enchanting_table_top: () => { const t = noiseTex('ett', 0x2a1a2a, 0.15); t.border(hex(0x8a1a2a)); t.rect(3, 3, 10, 10, hex(0xa8241e)); t.rect(4, 4, 8, 8, hex(0xe8e0c8)); t.line(5, 6, 10, 6, hex(0x5a4a3a)); t.line(5, 9, 9, 9, hex(0x5a4a3a)); return t; },
  enchanting_table_side: () => { const t = noiseTex('ets', 0x1a1426, 0.25); t.rect(0, 0, 16, 4, hex(0xa8241e)); t.rect(0, 4, 16, 1, hex(0x5ae8e0)); t.speckle(hex(0x3a2a5a), 0.1); return t; },
  anvil: () => { const t = noiseTex('anv', 0x444448, 0.12); t.rect(0, 0, 16, 2, hex(0x5a5a60)); t.rect(0, 14, 16, 2, hex(0x333336)); return t; },
  anvil_top: () => { const t = noiseTex('anvt', 0x4a4a50, 0.1); t.border(hex(0x333336)); return t; },
  brewing_stand: () => cross('brew', (t) => { t.rect(7, 1, 2, 13, hex(0xe0b030)); t.rect(2, 13, 12, 3, hex(0x6a6a6a)); t.ellipse(3, 10, 2, 3, hex(0xc0d8f0)); t.ellipse(13, 10, 2, 3, hex(0xc0d8f0)); t.line(4, 8, 7, 4, hex(0x6a6a6a)); t.line(12, 8, 9, 4, hex(0x6a6a6a)); }),
  brewing_stand_top: () => { const t = new Tex('brewt').clear(); t.rect(7, 7, 2, 2, hex(0xe0b030)); return t; },
  cauldron_side: () => { const t = noiseTex('caus', 0x3a3a3e, 0.12); t.rect(0, 0, 16, 2, hex(0x4a4a50)); t.rect(4, 13, 8, 3, [0, 0, 0], 0); return t; },
  cauldron_top: () => { const t = new Tex('caut').clear(); t.border(hex(0x4a4a50)); t.rect(1, 1, 14, 1, hex(0x333336)); t.rect(1, 1, 1, 14, hex(0x333336)); return t; },
  grindstone: () => { const t = noiseTex('grind', 0x8a8a8a, 0.1); t.ellipse(8, 8, 6, 6, hex(0x9a9a98), 0.05); t.ellipse(8, 8, 2, 2, hex(0x6a5a40)); return t; },
  grindstone_top: () => noiseTex('grindt', 0x7a7a78, 0.1),
  smithing_table_top: () => { const t = noiseTex('smt', 0x2e2e36, 0.12); t.border(hex(0x5a3a2a)); return t; },
  smithing_table_side: () => { const t = planks('sms', 0x4a3424); t.rect(0, 0, 16, 3, hex(0x2e2e36)); t.rect(4, 6, 8, 4, hex(0x8a8a8a)); return t; },
  smithing_table_bottom: () => planks('smb', 0x3a2818),
  stonecutter_top: () => { const t = noiseTex('sct', 0x8a8a8a, 0.08); t.rect(1, 7, 14, 2, hex(0x5a5a5a)); t.rect(4, 7, 8, 2, hex(0xc8c8c8)); return t; },
  stonecutter_side: () => { const t = noiseTex('scs', 0x7a7a7a, 0.08); t.rect(0, 0, 16, 2, hex(0x6a4a2a)); return t; },
  loom_top: () => planks('loomt', 0xb08a5a),
  loom_side: () => { const t = planks('looms', 0x9a7448); t.rect(2, 4, 12, 2, hex(0xe8e8e8)); return t; },
  loom_front: () => { const t = planks('loomf', 0x9a7448); for (let x = 3; x < 13; x += 2) for (let y = 3; y < 12; y++) t.set(x, y, hex(0xe8e8e8)); return t; },
  cartography_top: () => { const t = planks('cart', 0x4a3220); t.rect(2, 2, 12, 12, hex(0xe8dcb8)); t.line(3, 10, 8, 4, hex(0x3a6a3a)); t.line(8, 4, 12, 8, hex(0x3a5ad8)); return t; },
  cartography_side: () => { const t = planks('cars', 0x4a3220); t.rect(3, 5, 10, 6, hex(0xe8dcb8)); return t; },
  dark_planks: () => planks('dkp', 0x3e2912),
  fletching_top: () => { const t = planks('flt', 0xd8c890); t.line(3, 3, 12, 12, hex(0x6a4a26)); t.rect(11, 2, 3, 3, hex(0xe8e8e8)); return t; },
  fletching_side: () => { const t = planks('fls', 0xc8b478); t.rect(3, 4, 10, 1, hex(0x6a4a26)); t.rect(3, 9, 10, 1, hex(0x6a4a26)); return t; },
  smoker_top: () => noiseTex('smkt', 0x5a5450, 0.12),
  smoker_side: () => { const t = logSide('smks', 0x5a4028); t.rect(0, 12, 16, 4, hex(0x5a5450)); return t; },
  smoker_front: () => { const t = logSide('smkf', 0x5a4028); t.rect(3, 6, 10, 6, hex(0x1a1a1a)); t.rect(0, 12, 16, 4, hex(0x5a5450)); return t; },
  smoker_front_on: () => { const t = logSide('smkf', 0x5a4028); t.rect(3, 6, 10, 6, hex(0xff9a2a)); t.rect(4, 9, 8, 3, hex(0xffd84a)); t.rect(0, 12, 16, 4, hex(0x5a5450)); return t; },
  blast_top: () => { const t = noiseTex('blt', 0x6a6a70, 0.08); t.border(hex(0x4a4a50)); return t; },
  blast_side: () => { const t = bricks('bls', 0x5a5a60, 0x3a3a40, 4, 8); return t; },
  blast_front: () => { const t = bricks('blf', 0x5a5a60, 0x3a3a40, 4, 8); t.rect(4, 7, 8, 6, hex(0x1a1a1a)); for (let x = 4; x < 12; x += 2) t.rect(x, 7, 1, 6, hex(0x3a3a40)); return t; },
  blast_front_on: () => { const t = bricks('blf', 0x5a5a60, 0x3a3a40, 4, 8); t.rect(4, 7, 8, 6, hex(0xff9a2a)); for (let x = 4; x < 12; x += 2) t.rect(x, 7, 1, 6, hex(0x3a3a40)); return t; },
  barrel_top: () => { const t = planks('bart', 0x8a6436); t.border(hex(0x4a3418)); t.rect(5, 5, 6, 6, hex(0x5a4020)); return t; },
  barrel_side: () => { const t = logSide('bars', 0x8a6436, 0.85); t.rect(0, 3, 16, 1, hex(0x3a3a3a)); t.rect(0, 12, 16, 1, hex(0x3a3a3a)); return t; },
  barrel_bottom: () => planks('barb', 0x7a5a30),
  composter_side: () => { const t = planks('coms', 0x8a6436); t.rect(0, 0, 2, 16, hex(0x5a4020)); t.rect(14, 0, 2, 16, hex(0x5a4020)); return t; },
  composter_top: () => { const t = new Tex('comt').clear(); t.border(hex(0x5a4020)); t.rect(1, 1, 14, 1, hex(0x5a4020)); return t; },
  composter_bottom: () => planks('comb', 0x6a4a26),
  lectern_top: () => { const t = planks('lect', 0xa2834f); t.rect(3, 2, 10, 12, hex(0x7a3a1a)); return t; },
  lectern_side: () => { const t = planks('lecs', 0x8a6436); t.rect(6, 0, 4, 16, hex(0x6a4a26)); return t; },
  ...Object.fromEntries([0, 1, 2, 3].map((i) => [`nether_wart_${i}`, () => cross('nw' + i, (t) => { const c = [hex(0x8a1a1a), hex(0xa82a2a)]; for (let k = 0; k < 3 + i; k++) { const x = 3 + k * 3 % 11, h = 3 + i * 3; for (let y = 0; y < h; y++) t.set(x, 15 - y, c[(y + k) % 2]); t.ellipse(x + 0.5, 15 - h + 0.5, 1.5, 1.5, hex(0xb83030)); } })])),
  redstone_dust: () => { const t = new Tex('rdust').clear(); const c = [235, 235, 235]; t.rect(6, 6, 4, 4, c); t.rect(7, 0, 2, 16, c); t.rect(0, 7, 16, 2, c); t.speckle([255, 255, 255], 0.0); for (let i = 0; i < 18; i++) t.set((t.r() * 16) | 0, (t.r() * 16) | 0, [210, 210, 210], t.r() < 0.4 ? 255 : 0); return t; },
  redstone_torch: () => { const t = new Tex('rtorch').clear(); for (let y = 6; y < 16; y++) { t.set(7, y, hex(0x6b4a26)); t.set(8, y, hex(0x8a6436)); } t.rect(7, 4, 2, 2, hex(0xff2a1a)); t.set(7, 3, hex(0xff8a7a)); return t; },
  redstone_torch_off: () => { const t = new Tex('rtorchf').clear(); for (let y = 6; y < 16; y++) { t.set(7, y, hex(0x6b4a26)); t.set(8, y, hex(0x8a6436)); } t.rect(7, 4, 2, 2, hex(0x5a1a10)); return t; },
  lever: () => { const t = new Tex('lever').clear(); for (let y = 2; y < 12; y++) t.set(7 + (y > 6 ? 0 : 1), y, hex(0x8a6436)); t.rect(4, 11, 8, 5, hex(0x7a7a7a)); return t; },
  repeater: () => { const t = noiseTex('rep', 0xa0a0a0, 0.05); t.rect(7, 2, 2, 12, hex(0x6a1a10)); t.rect(6, 3, 4, 3, hex(0xd03020)); t.rect(6, 10, 4, 3, hex(0xd03020)); t.line(7, 0, 5, 2, hex(0x5a5a5a)); t.line(8, 0, 10, 2, hex(0x5a5a5a)); return t; },
  repeater_on: () => { const t = noiseTex('rep', 0xa0a0a0, 0.05); t.rect(7, 2, 2, 12, hex(0xff3a20)); t.rect(6, 3, 4, 3, hex(0xff6040)); t.rect(6, 10, 4, 3, hex(0xff6040)); t.line(7, 0, 5, 2, hex(0x5a5a5a)); t.line(8, 0, 10, 2, hex(0x5a5a5a)); return t; },
  comparator: () => { const t = noiseTex('comp', 0xa0a0a0, 0.05); t.rect(3, 3, 3, 3, hex(0xd03020)); t.rect(10, 3, 3, 3, hex(0xd03020)); t.rect(6, 11, 4, 3, hex(0xd03020)); t.line(4, 6, 8, 11, hex(0x6a1a10)); t.line(11, 6, 8, 11, hex(0x6a1a10)); return t; },
  redstone_lamp: () => { const t = noiseTex('rlamp', 0x5a3a20, 0.15); t.border(hex(0x3a2410)); for (let i = 3; i < 13; i += 4) { t.rect(i, 2, 1, 12, hex(0x7a5a30)); t.rect(2, i, 12, 1, hex(0x7a5a30)); } return t; },
  redstone_lamp_on: () => { const t = noiseTex('rlampon', 0xd8a050, 0.15); t.border(hex(0x8a5a20)); for (let i = 3; i < 13; i += 4) { t.rect(i, 2, 1, 12, hex(0xfff0b0)); t.rect(2, i, 12, 1, hex(0xfff0b0)); } return t; },
  piston_top: () => { const t = planks('pistt', 0xa2834f); t.border(hex(0x6a5030)); return t; },
  piston_top_sticky: () => { const t = planks('pistts', 0xa2834f); t.rect(2, 2, 12, 12, hex(0x6ab84a)); t.speckle(hex(0x8ad86a), 0.05); t.border(hex(0x6a5030)); return t; },
  piston_side: () => { const t = cobble(new Tex('pists')); t.rect(0, 0, 16, 4, hex(0xa2834f)); t.rect(0, 4, 16, 1, hex(0x5a4020)); return t; },
  piston_bottom: () => { const t = cobble(new Tex('pistb')); t.rect(6, 6, 4, 4, hex(0x8a8a8a)); return t; },
  observer_front: () => { const t = noiseTex('obsf', 0x6a6a6a, 0.08); t.rect(2, 4, 4, 4, hex(0x2a2a2a)); t.rect(10, 4, 4, 4, hex(0x2a2a2a)); t.rect(3, 11, 10, 2, hex(0x3a3a3a)); return t; },
  observer_back: () => { const t = noiseTex('obsb', 0x6a6a6a, 0.08); t.rect(6, 6, 4, 4, hex(0x7a1a10)); return t; },
  observer_side: () => { const t = noiseTex('obss', 0x6a6a6a, 0.08); t.rect(0, 7, 16, 2, hex(0x8a8a8a)); return t; },
  observer_top: () => { const t = noiseTex('obst', 0x6a6a6a, 0.08); t.rect(7, 0, 2, 16, hex(0x8a2a20)); return t; },
  dispenser_front: () => { const t = cobble(new Tex('dispf'), hex(0x8a8a8a)); t.ellipse(8, 8, 4, 4, hex(0x1a1a1a)); t.rect(7, 4, 2, 2, hex(0x3a3a3a)); return t; },
  dropper_front: () => { const t = cobble(new Tex('dropf'), hex(0x8a8a8a)); t.rect(4, 5, 8, 6, hex(0x1a1a1a)); return t; },
  hopper_top: () => { const t = noiseTex('hopt', 0x3a3a3e, 0.1); t.border(hex(0x2a2a2e)); t.rect(3, 3, 10, 10, hex(0x1a1a1e)); return t; },
  hopper_side: () => { const t = noiseTex('hops', 0x3a3a3e, 0.1); t.rect(0, 0, 16, 5, hex(0x4a4a50)); return t; },
  note_block: () => { const t = planks('note', 0x6a4426); t.border(hex(0x3a2210)); t.rect(5, 4, 2, 7, hex(0x1a1a1a)); t.rect(5, 9, 4, 3, hex(0x1a1a1a)); t.rect(9, 4, 2, 6, hex(0x1a1a1a)); return t; },
  daylight_top: () => { const t = noiseTex('dlt', 0x4a6a8a, 0.1); for (let i = 2; i < 16; i += 4) { t.rect(i, 1, 2, 14, hex(0xb0c8e0)); } t.border(hex(0x6a4a26)); return t; },
  daylight_side: () => { const t = planks('dls', 0x8a6436); t.rect(0, 0, 16, 10, [0, 0, 0], 0); return t; },
  target_top: () => { const t = noiseTex('tgtt', 0xd8c890, 0.1); t.ellipse(8, 8, 6, 6, hex(0xe8e0d0)); t.ellipse(8, 8, 4, 4, hex(0xc02020)); t.ellipse(8, 8, 2, 2, hex(0xe8e0d0)); return t; },
  target_side: () => { const t = noiseTex('tgts', 0xe8e0d0, 0.05); t.ellipse(8, 8, 6, 6, hex(0xc02020)); t.ellipse(8, 8, 4, 4, hex(0xe8e0d0)); t.ellipse(8, 8, 2, 2, hex(0xc02020)); return t; },
  iron_door_bottom: () => { const t = noiseTex('idb', 0xc8c8c8, 0.05); t.border(hex(0x8a8a8a)); t.rect(3, 3, 10, 4, hex(0xa8a8a8)); t.rect(3, 9, 10, 4, hex(0xa8a8a8)); return t; },
  iron_door_top: () => { const t = noiseTex('idt', 0xc8c8c8, 0.05); t.border(hex(0x8a8a8a)); t.rect(4, 3, 3, 4, [0, 0, 0], 0); t.rect(9, 3, 3, 4, [0, 0, 0], 0); return t; },
  rail: () => { const t = new Tex('rail').clear(); for (let y = 0; y < 16; y += 3) t.rect(1, y, 14, 2, hex(0x6a4a26)); for (let y = 0; y < 16; y++) { t.set(3, y, hex(0x9a9a9a)); t.set(4, y, hex(0x6a6a6a)); t.set(11, y, hex(0x9a9a9a)); t.set(12, y, hex(0x6a6a6a)); } return t; },
  rail_corner: () => { const t = new Tex('railc').clear(); for (let i = 0; i < 16; i += 3) t.rect(1, i, 14, 2, hex(0x6a4a26)); for (let a = 0; a < 40; a++) { const ang = a / 40 * Math.PI / 2; for (const r of [4, 12]) t.set(Math.round(16 - Math.cos(ang) * r), Math.round(16 - Math.sin(ang) * r), hex(0x9a9a9a)); } return t; },
  powered_rail: () => { const t = blockTexDefs.rail(); for (let y = 0; y < 16; y++) { t.set(3, y, hex(0xe0b830)); t.set(11, y, hex(0xe0b830)); } t.rect(7, 2, 2, 12, hex(0x8a1a10)); return t; },
  detector_rail: () => { const t = blockTexDefs.rail(); t.rect(6, 6, 4, 4, hex(0x6a6a6a)); t.rect(7, 7, 2, 2, hex(0xa82a1a)); return t; },
  activator_rail: () => { const t = blockTexDefs.rail(); t.rect(7, 1, 2, 14, hex(0x7a1a10)); return t; },
  spawner: () => { const t = new Tex('spawner').clear(); const c = hex(0x2a3440); for (let i = 0; i < 16; i += 3) for (let k = 0; k < 16; k++) { t.set(i, k, shade(c, 0.9 + t.r() * 0.3)); t.set(k, i, shade(c, 0.9 + t.r() * 0.3)); } t.border(hex(0x1a2028)); return t; },
  path_top: () => noiseTex('patht', 0x947a44, 0.12, (t) => t.speckle(hex(0x7a6236), 0.15)),
  path_side: () => { const t = blockTexDefs.dirt(); for (let x = 0; x < 16; x++) { t.set(x, 0, [0, 0, 0], 0); t.set(x, 1, hex(0x947a44)); t.set(x, 2, hex(0x8a7040)); } return t; },
  sponge: () => noiseTex('sponge', 0xc8c84a, 0.15, (t) => t.speckle(hex(0x8a8a2a), 0.2)),
  bed_top: () => { const t = new Tex('bed').fill(hex(0xa82a2a), 0.06); t.rect(0, 0, 16, 5, hex(0xe8e8e8)); t.rect(0, 5, 16, 1, hex(0x7a1a1a)); return t; },
  bed_side: () => { const t = new Tex('beds').clear(); t.rect(0, 7, 16, 5, hex(0xa82a2a)); t.rect(0, 7, 5, 3, hex(0xe8e8e8)); t.rect(0, 12, 16, 4, hex(0xa2834f)); t.rect(3, 12, 10, 4, [0, 0, 0], 0); return t; },
  door_bottom: () => { const t = planks('door', 0xa2834f); t.border(hex(0x6b5233)); t.rect(3, 3, 10, 4, hex(0x8a6a3e)); t.rect(3, 9, 10, 4, hex(0x8a6a3e)); t.set(12, 1, hex(0x3a3a3a)); return t; },
  door_top: () => { const t = planks('doort', 0xa2834f); t.border(hex(0x6b5233)); t.rect(3, 3, 4, 4, [0, 0, 0], 0); t.rect(9, 3, 4, 4, [0, 0, 0], 0); t.rect(3, 9, 10, 4, hex(0x8a6a3e)); t.rect(11, 13, 2, 2, hex(0x3a3a3a)); return t; },
};
for (const [n, c] of Object.entries(WOOL_COLORS)) {
  blockTexDefs[n + '_wool'] = () => wool(n + 'w', c);
  blockTexDefs[n + '_concrete'] = () => new Tex(n + 'c').fill(shade(hex(c), 0.92), 0.03);
}
for (let i = 0; i < 8; i++) {
  blockTexDefs['wheat_' + i] = () => cross('wheat' + i, (t) => {
    const g = hex(0x5aa020), y = hex(0xc8a03a), d = hex(0xa07a24);
    const cols = i < 5 ? [g, shade(g, 1.15)] : i < 7 ? [g, mix(g, y, 0.6)] : [d, y, y];
    plantStalks(t, cols, 3 + i * 1.6, 7);
  });
  blockTexDefs['carrots_' + i] = () => cross('car' + i, (t) => { plantStalks(t, [hex(0x3a8a1a), hex(0x5ab02a)], 2 + i, 5); if (i === 7) for (const x of [3, 8, 12]) { t.set(x, 15, hex(0xe87a10)); t.set(x, 14, hex(0xe87a10)); } });
  blockTexDefs['potatoes_' + i] = () => cross('pot' + i, (t) => { plantStalks(t, [hex(0x3a7a1a), hex(0x4a9a2a)], 2 + i, 5); if (i === 7) for (const x of [4, 10]) t.ellipse(x, 14, 1.5, 1.2, hex(0xc8a050)); });
}
for (let i = 0; i < 10; i++) blockTexDefs['destroy_' + i] = () => crack(i);

// ---------------------------------------------------------------- atlas
export const tileIndex = {};
export const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = atlasCanvas.height = ATLAS_SIZE;
const actx = atlasCanvas.getContext('2d');
const tileCanvases = {};
{
  let idx = 0;
  for (const name of Object.keys(blockTexDefs)) {
    const t = blockTexDefs[name]();
    const img = new ImageData(t.d, S, S);
    const tx = idx % ATLAS_TILES, ty = Math.floor(idx / ATLAS_TILES);
    actx.putImageData(img, tx * S, ty * S);
    const c = document.createElement('canvas'); c.width = c.height = S;
    c.getContext('2d').putImageData(img, 0, 0);
    tileCanvases[name] = c;
    tileIndex[name] = idx++;
  }
}
export function tileCanvas(name) { return tileCanvases[name]; }
export function tileUV(name) {
  const idx = tileIndex[name] ?? 0;
  const tx = idx % ATLAS_TILES, ty = Math.floor(idx / ATLAS_TILES);
  // flipY=false on texture; v grows downward in atlas
  return [tx / ATLAS_TILES, ty / ATLAS_TILES, 1 / ATLAS_TILES];
}

// ---------------------------------------------------------------- item sprites
const TOOL_MASKS = {
  pickaxe: [
    '................', '....hhhhhh......', '...hhhhhhhhh....', '....hh...hhhh...',
    '..........shh...', '.........ss.hh..', '........ss...hh.', '.......ss.....h.',
    '......ss........', '.....ss.........', '....ss..........', '...ss...........',
    '..ss............', '.ss.............', '.s..............', '................'],
  axe: [
    '................', '.......hhh......', '......hhhhh.....', '.....hhhhhhh....',
    '.....hhhhhshh...', '......hhhss.....', '.......hss......', '.......ss.......',
    '......ss........', '.....ss.........', '....ss..........', '...ss...........',
    '..ss............', '.ss.............', '.s..............', '................'],
  shovel: [
    '................', '...........hhh..', '..........hhhhh.', '..........hhhhh.',
    '.........hhhhh..', '..........shh...', '.........ss.....', '........ss......',
    '.......ss.......', '......ss........', '.....ss.........', '....ss..........',
    '...ss...........', '..ss............', '.ss.............', '................'],
  sword: [
    '................', '.............hh.', '............hhh.', '...........hhh..',
    '..........hhh...', '.........hhh....', '........hhh.....', '...g...hhh......',
    '....g.hhh.......', '.....ghh........', '......g.........', '.....s.g........',
    '....s...g.......', '...s............', '..ss............', '................'],
  hoe: [
    '................', '......hhhhh.....', '.....hhhhhhh....', '..........shh...',
    '.........ss.....', '........ss......', '.......ss.......', '......ss........',
    '.....ss.........', '....ss..........', '...ss...........', '..ss............',
    '.ss.............', '................', '................', '................'],
  helmet: [
    '................', '................', '................', '....hhhhhhhh....',
    '...hhhhhhhhhh...', '...hhhhhhhhhh...', '...hh......hh...', '...hh......hh...',
    '...hh......hh...', '................', '................', '................',
    '................', '................', '................', '................'],
  chestplate: [
    '................', '..hhh......hhh..', '.hhhhh....hhhhh.', '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.', '..hhhhhhhhhhhh..', '...hhhhhhhhhh...', '...hhhhhhhhhh...',
    '...hhhhhhhhhh...', '...hhhhhhhhhh...', '...hhhhhhhhhh...', '...hhhhhhhhhh...',
    '...hhhhhhhhhh...', '................', '................', '................'],
  leggings: [
    '................', '...hhhhhhhhhh...', '...hhhhhhhhhh...', '...hhhhhhhhhh...',
    '...hhhhhhhhhh...', '...hhhh..hhhh...', '...hhh....hhh...', '...hhh....hhh...',
    '...hhh....hhh...', '...hhh....hhh...', '...hhh....hhh...', '...hhh....hhh...',
    '...hhh....hhh...', '...hhh....hhh...', '................', '................'],
  boots: [
    '................', '................', '................', '................',
    '................', '................', '................', '...hhh....hhh...',
    '...hhh....hhh...', '...hhh....hhh...', '..hhhh....hhhh..', '.hhhhh....hhhhh.',
    '.hhhhh....hhhhh.', '................', '................', '................'],
};
const MATERIAL_COLORS = {
  wooden: 0xa2834f, stone: 0x8a8a8a, iron: 0xdadada, golden: 0xfad64a, diamond: 0x4aedd9, netherite: 0x4a3f44,
  leather: 0x9c5a3a, chainmail: 0x9a9a9a,
};
function toolSprite(kind, mat) {
  const t = new Tex(kind + mat);
  const h = hex(MATERIAL_COLORS[mat]);
  t.mask(TOOL_MASKS[kind], { h, s: hex(0x6b4a26), g: shade(hex(0x6b4a26), 0.8) });
  t.relief(1.25, 0.75);
  t.outline(shade(h, 0.35));
  return t;
}
function blob(name, color, rx = 5, ry = 5, cx = 8, cy = 8, deco) {
  const t = new Tex(name).clear();
  t.ellipse(cx, cy, rx, ry, hex(color), 0.15);
  if (deco) deco(t);
  t.relief(1.2, 0.75);
  t.outline(shade(hex(color), 0.35));
  return t;
}
function ingot(name, color) {
  const t = new Tex(name).clear();
  const c = hex(color);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) t.set(3 + x + (4 - y), 6 + y, shade(c, y === 0 ? 1.3 : y === 4 ? 0.7 : 1));
  t.outline(shade(c, 0.4));
  return t;
}
function gem(name, color) {
  const t = new Tex(name).clear();
  const c = hex(color);
  for (let y = 0; y < 12; y++) { const w = y < 4 ? 2 + y * 2 : Math.max(0, (11 - y) * 1.2 | 0); for (let x = -w / 2; x < w / 2; x++) t.set(8 + Math.floor(x), 2 + y, shade(c, y < 4 ? 1.25 : x < 0 ? 1 : 0.8)); }
  t.set(7, 4, [255, 255, 255]);
  t.outline(shade(c, 0.35));
  return t;
}
function dust(name, color) {
  const t = new Tex(name).clear();
  for (let i = 0; i < 40; i++) { const a = t.r() * 6.28, r = t.r() * 5; t.set(8 + Math.cos(a) * r | 0, 9 + Math.sin(a) * r * 0.7 | 0, shade(hex(color), 0.7 + t.r() * 0.6)); }
  return t;
}
function rod(name, color, light) {
  const t = new Tex(name).clear();
  for (let i = 0; i < 12; i++) { t.set(3 + i, 13 - i, hex(color)); t.set(4 + i, 13 - i, shade(hex(color), 0.75)); }
  if (light) t.speckle(hex(light), 0.0);
  t.outline(shade(hex(color), 0.4));
  return t;
}
function bucket(name, liquid) {
  const t = new Tex(name).clear();
  const c = hex(0xc8c8c8);
  for (let y = 5; y < 14; y++) { const w = 10 - Math.floor((y - 5) / 3); for (let x = 0; x < w; x++) t.set(8 - w / 2 + x | 0, y, shade(c, x < 2 ? 1.2 : x > w - 3 ? 0.7 : 1)); }
  t.line(3, 5, 5, 2, shade(c, 0.6)); t.line(5, 2, 11, 2, shade(c, 0.6)); t.line(11, 2, 13, 5, shade(c, 0.6));
  if (liquid) t.rect(4, 5, 8, 2, hex(liquid));
  t.outline(hex(0x3a3a3a));
  return t;
}
function food(name, color, shape = 'meat', cooked = false) {
  return blob(name, color, shape === 'meat' ? 6 : 4.5, shape === 'meat' ? 4 : 5, 8, 8, (t) => {
    if (shape === 'meat') { t.ellipse(10, 9, 2.4, 1.6, cooked ? hex(0xd8b08a) : hex(0xf0e0e0)); t.ellipse(5, 7, 1, 1, shade(hex(color), 1.2)); }
  });
}
function spawnEgg(name, a, b) {
  const t = new Tex(name).clear();
  t.ellipse(8, 8.5, 5, 6.5, hex(a), 0.1);
  for (let i = 0; i < 9; i++) t.ellipse(4 + t.r() * 8, 3 + t.r() * 11, 1.2, 1.2, hex(b));
  t.relief(1.15, 0.8);
  t.outline(shade(hex(a), 0.35));
  return t;
}
const itemSpriteDefs = {
  stick: () => { const t = new Tex('stick').clear(); for (let i = 0; i < 10; i++) { t.set(4 + i, 13 - i, hex(0x8a6436)); t.set(5 + i, 13 - i, hex(0x5a3c1c)); } t.outline(hex(0x2a1c0c)); return t; },
  coal: () => blob('coal', 0x2a2a2a, 5, 4.5, 8, 8.5, (t) => t.speckle(hex(0x4a4a4a), 0.1)),
  charcoal: () => blob('charcoal', 0x3a2e24, 5, 4.5, 8, 8.5),
  iron_ingot: () => ingot('ii', 0xd8d8d8),
  gold_ingot: () => ingot('gi', 0xf8d040),
  copper_ingot: () => ingot('ci', 0xe0805a),
  netherite_ingot: () => ingot('ni', 0x4a3f44),
  brick: () => ingot('bri', 0xa8543a),
  nether_brick: () => ingot('nbri', 0x4a1e20),
  netherite_scrap: () => blob('nscrap', 0x5a4038, 5, 4, 8, 9, (t) => t.speckle(hex(0x8a6a5a), 0.1)),
  raw_iron: () => blob('ri', 0xc8a690, 5, 4, 8, 9),
  raw_gold: () => blob('rg', 0xe8c040, 5, 4, 8, 9),
  raw_copper: () => blob('rc', 0xc0704a, 5, 4, 8, 9),
  gold_nugget: () => blob('gn', 0xf8d040, 2.8, 2.5, 8, 9),
  iron_nugget: () => blob('in', 0xd0d0d0, 2.8, 2.5, 8, 9),
  diamond: () => gem('dia', 0x5ae8e0),
  emerald: () => gem('eme', 0x2ad467),
  quartz: () => gem('qz', 0xece6df),
  lapis_lazuli: () => blob('lap', 0x2a52c0, 4.5, 4, 8, 9, (t) => t.speckle(hex(0x5a82f0), 0.06)),
  redstone: () => dust('rs', 0xd01a0a),
  glowstone_dust: () => dust('gd', 0xffd870),
  gunpowder: () => dust('gp', 0x5a5a5a),
  sugar: () => dust('sug', 0xf0f0f0),
  blaze_powder: () => dust('bp', 0xf0a020),
  bone_meal: () => dust('bm', 0xe8e8e0),
  flint: () => blob('flint', 0x3a3a3a, 4, 5.5, 8, 8, (t) => t.speckle(hex(0x6a6a6a), 0.1)),
  apple: () => blob('apple', 0xd8221a, 5, 5, 8, 9, (t) => { t.rect(8, 2, 1, 3, hex(0x5a3a1a)); t.set(9, 3, hex(0x3a8a1a)); t.set(10, 3, hex(0x3a8a1a)); t.set(6, 7, hex(0xff8a7a)); }),
  golden_apple: () => blob('gapple', 0xf0c830, 5, 5, 8, 9, (t) => { t.rect(8, 2, 1, 3, hex(0x5a3a1a)); t.set(6, 7, hex(0xfff0a0)); }),
  bread: () => blob('bread', 0xb8823a, 7, 3.5, 8, 9, (t) => { for (const x of [4, 7, 10]) t.line(x, 7, x + 1, 9, hex(0x8a5a1a)); }),
  porkchop: () => food('pork', 0xf08a8a),
  cooked_porkchop: () => food('cpork', 0xb8703a, 'meat', true),
  beef: () => food('beef', 0xc8302a),
  cooked_beef: () => food('cbeef', 0x7a4020, 'meat', true),
  chicken: () => food('chick', 0xf0c8b0),
  cooked_chicken: () => food('cchick', 0xc88a3a, 'meat', true),
  mutton: () => food('mutt', 0xc84a3a),
  cooked_mutton: () => food('cmutt', 0x8a4a2a, 'meat', true),
  rotten_flesh: () => food('rot', 0x8a6a3a),
  carrot: () => { const t = new Tex('carrot').clear(); for (let i = 0; i < 9; i++) for (let k = -1; k <= 1; k++) if (i < 7 || k === 0) t.set(4 + i + k, 13 - i, shade(hex(0xf08a1a), k ? 0.85 : 1.1)); t.line(12, 4, 14, 1, hex(0x3a8a1a)); t.line(12, 4, 11, 1, hex(0x3a8a1a)); t.outline(hex(0x6a3a0a)); return t; },
  potato: () => blob('potato', 0xc8a050, 5, 4, 8, 9),
  baked_potato: () => blob('bpotato', 0xd8a840, 5, 4, 8, 9, (t) => t.rect(6, 6, 4, 2, hex(0xf8e8a0))),
  melon_slice: () => { const t = new Tex('mel').clear(); for (let y = 0; y < 8; y++) for (let x = 0; x < 12 - y; x++) t.set(2 + x + y / 2 | 0, 4 + y, y === 7 ? hex(0x4a8a1a) : hex(0xe0302a)); t.set(5, 6, [20, 20, 20]); t.set(9, 6, [20, 20, 20]); t.outline(hex(0x3a1010)); return t; },
  wheat: () => { const t = new Tex('wheati').clear(); for (let i = 0; i < 3; i++) t.line(5 + i * 2, 14, 7 + i * 2, 3, hex(0xc8a03a)); t.speckle(hex(0x0), 0); t.ellipse(9, 5, 3, 3, hex(0xd8b04a)); t.outline(hex(0x6a4a10)); return t; },
  wheat_seeds: () => { const t = new Tex('seeds').clear(); for (let i = 0; i < 7; i++) t.rect(3 + (t.r() * 9) | 0, 4 + (t.r() * 8) | 0, 2, 1, hex(0x4a8a2a)); return t; },
  egg: () => blob('egg', 0xe8d8b0, 4, 5.5, 8, 8.5, (t) => t.speckle(hex(0xc8a880), 0.05)),
  feather: () => { const t = new Tex('feather').clear(); t.line(3, 14, 12, 2, hex(0x9a9a9a)); for (let i = 2; i < 10; i++) { t.set(3 + i, 12 - i, hex(0xf0f0f0)); t.set(4 + i, 13 - i, hex(0xe0e0e0)); t.set(2 + i, 11 - i, hex(0xd8d8d8)); } t.outline(hex(0x6a6a6a)); return t; },
  leather: () => blob('leather', 0xa0582e, 6, 5, 8, 8),
  string: () => { const t = new Tex('string').clear(); const c = hex(0xf0f0f0); t.line(3, 12, 6, 4, c); t.line(6, 4, 10, 10, c); t.line(10, 10, 13, 3, c); return t; },
  bone: () => { const t = new Tex('bone').clear(); for (let i = 0; i < 9; i++) { t.set(4 + i, 12 - i, hex(0xe8e8d8)); t.set(5 + i, 12 - i, hex(0xc8c8b8)); } t.rect(2, 11, 3, 3, hex(0xe8e8d8)); t.rect(12, 2, 3, 3, hex(0xe8e8d8)); t.outline(hex(0x6a6a5a)); return t; },
  arrow: () => { const t = new Tex('arrow').clear(); t.line(3, 13, 12, 4, hex(0x8a6436)); t.rect(11, 2, 3, 3, hex(0x9a9a9a)); t.set(14, 2, hex(0x5a5a5a)); t.rect(2, 12, 2, 3, hex(0xe8e8e8)); t.rect(2, 14, 3, 1, hex(0xe8e8e8)); return t; },
  bow: () => { const t = new Tex('bow').clear(); const w = hex(0x8a6436); for (let i = 0; i < 12; i++) { const a = i / 11 * Math.PI / 2; t.set(2 + Math.round(Math.sin(a) * 11), 13 - Math.round((1 - Math.cos(a)) * 11), w); t.set(3 + Math.round(Math.sin(a) * 10), 13 - Math.round((1 - Math.cos(a)) * 10), shade(w, 0.75)); } t.line(2, 13, 13, 2, hex(0xe0e0e0)); return t; },
  ender_pearl: () => blob('pearl', 0x1a5a4a, 4.5, 4.5, 8, 8, (t) => { t.ellipse(8, 8, 2.2, 2.2, hex(0x2a9a8a)); t.set(6, 6, hex(0x9af0e0)); }),
  ender_eye: () => blob('eye', 0x2a8a5a, 4.5, 4.5, 8, 8, (t) => { t.ellipse(8, 8, 2.5, 3, hex(0x9ad85a)); t.rect(7, 6, 2, 4, hex(0x0a2010)); }),
  blaze_rod: () => rod('brod', 0xf0b020),
  ghast_tear: () => blob('tear', 0xd8f0f0, 3, 4.5, 8, 9),
  slime_ball: () => blob('slime', 0x6ac850, 4.5, 4.5, 8, 8),
  bucket: () => bucket('bucket'),
  water_bucket: () => bucket('wbucket', 0x3a5ad8),
  lava_bucket: () => bucket('lbucket', 0xf08a1a),
  milk_bucket: () => bucket('mbucket', 0xf8f8f8),
  flint_and_steel: () => { const t = new Tex('fns').clear(); t.ellipse(5, 10, 3, 3.5, hex(0x3a3a3a)); t.line(8, 4, 13, 9, hex(0xb8b8b8)); t.line(8, 4, 8, 8, hex(0xb8b8b8)); t.outline(hex(0x1a1a1a)); return t; },
  shears: () => { const t = new Tex('shears').clear(); t.line(3, 3, 11, 11, hex(0xd8d8d8)); t.line(11, 3, 3, 11, hex(0xc0c0c0)); t.ellipse(12, 12, 2.2, 2.2, hex(0x8a3a1a)); t.ellipse(4, 12, 2.2, 2.2, hex(0x8a3a1a)); t.outline(hex(0x2a2a2a)); return t; },
  paper: () => { const t = new Tex('paper').clear(); t.rect(3, 2, 10, 12, hex(0xf0f0e8)); t.rect(4, 4, 8, 1, hex(0xc8c8c0)); t.rect(4, 7, 8, 1, hex(0xc8c8c0)); t.outline(hex(0x8a8a80)); return t; },
  book: () => { const t = new Tex('book').clear(); t.rect(3, 2, 10, 12, hex(0x7a3a1a)); t.rect(11, 3, 2, 10, hex(0xf0f0e8)); t.rect(3, 2, 1, 12, hex(0x5a2a10)); t.outline(hex(0x2a1008)); return t; },
  snowball: () => blob('snowb', 0xf8ffff, 4, 4, 8, 8),
  clay_ball: () => blob('clayb', 0xa2a7b4, 4.5, 4, 8, 8),
  glass_bottle: () => { const t = new Tex('gbot').clear(); t.rect(6, 2, 4, 2, hex(0xa08060)); t.rect(7, 4, 2, 3, hex(0xd8f0ff)); t.ellipse(8, 11, 4.5, 4.5, hex(0xd8f0ff)); t.ellipse(8, 11, 3, 3, [0, 0, 0], 0); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (t.alpha(x, y) === 0 && (x - 8) ** 2 + (y - 11) ** 2 < 9) t.set(x, y, [200, 230, 255], 90); t.outline(hex(0x5a6a7a)); return t; },
  potion: () => itemSpriteDefs.glass_bottle(),
  splash_potion: () => { const t = itemSpriteDefs.glass_bottle(); t.rect(6, 1, 4, 1, hex(0x7a7a7a)); return t; },
  potion_overlay: () => { const t = new Tex('pov').clear(); t.ellipse(8, 11, 3.5, 3.5, [255, 255, 255]); t.rect(7, 5, 2, 3, [255, 255, 255]); return t; },
  experience_bottle: () => { const t = itemSpriteDefs.glass_bottle(); t.ellipse(8, 11, 3.2, 3.2, hex(0xb8ff40)); t.set(6, 10, hex(0xffffc0)); return t; },
  enchanted_book: () => { const t = new Tex('ebook').clear(); t.rect(3, 2, 10, 12, hex(0x7a2a8a)); t.rect(11, 3, 2, 10, hex(0xf0f0e8)); t.rect(3, 2, 1, 12, hex(0x5a1a6a)); t.rect(6, 6, 3, 2, hex(0xf0d050)); t.outline(hex(0x2a0a2a)); return t; },
  name_tag: () => { const t = new Tex('ntag').clear(); for (let y = 0; y < 8; y++) for (let x = 0; x < 10 - Math.abs(y - 3); x++) t.set(3 + x, 5 + y, hex(0xd8c8a8)); t.set(5, 8, [40, 30, 20]); t.line(2, 4, 5, 7, hex(0xe8e8e8)); t.outline(hex(0x5a4a3a)); return t; },
  nether_wart: () => blob('nwart', 0xa82a2a, 4, 4.5, 8, 9, (t) => t.speckle(hex(0x6a1010), 0.12)),
  spider_eye: () => blob('seye', 0x8a1a2a, 4.5, 4.5, 8, 8, (t) => { t.ellipse(8, 8, 2, 2, hex(0xd84a5a)); t.set(7, 7, hex(0xffd0d0)); }),
  fermented_spider_eye: () => blob('feye', 0x6a3a2a, 4.5, 4.5, 8, 8, (t) => { t.ellipse(8, 8, 2, 2, hex(0xa86a4a)); t.speckle(hex(0x3a8a2a), 0.06); }),
  glistering_melon_slice: () => { const t = itemSpriteDefs.melon_slice(); t.speckle(hex(0xf8e060), 0.08); return t; },
  magma_cream: () => blob('mcream', 0x8a4a1a, 4.5, 4.5, 8, 8, (t) => { t.ellipse(8, 8, 2.5, 2.5, hex(0xf0a020)); }),
  golden_carrot: () => { const t = itemSpriteDefs.carrot(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = t.get(x, y); if (c[3] && c[0] > 150 && c[1] < 160) t.set(x, y, [248, 208, 64]); } return t; },
  rabbit_foot: () => blob('rfoot', 0xc8a880, 3, 5.5, 8, 8, (t) => t.ellipse(8, 12, 3, 2, hex(0xe8d8c0))),
  phantom_membrane: () => { const t = new Tex('pmem').clear(); for (let y = 3; y < 13; y++) for (let x = 2; x < 14; x++) if (Math.abs(x - 8) < 7 - (y - 3) * 0.4) t.set(x, y, shade(hex(0xc8c0b0), 0.9 + t.r() * 0.2), 220); t.outline(hex(0x6a6058)); return t; },
  turtle_scute: () => blob('scute', 0x4a9a3a, 5, 4, 8, 9, (t) => t.ellipse(8, 9, 2.5, 2, hex(0x6ab84a))),
  ...Object.fromEntries(['oak', 'spruce', 'birch', 'jungle', 'acacia'].map((w) => [`${w}_boat`, () => { const c = { oak: 0xa2834f, spruce: 0x725430, birch: 0xc4b077, jungle: 0xa07351, acacia: 0xa8582f }[w]; const t = new Tex(w + 'boat').clear(); for (let y = 0; y < 5; y++) for (let x = y; x < 16 - y; x++) t.set(x, 7 + y, shade(hex(c), y === 0 ? 1.2 : 1)); t.rect(3, 6, 10, 1, shade(hex(c), 0.7)); t.line(4, 3, 9, 8, hex(0x5a3a1a)); t.outline(shade(hex(c), 0.35)); return t; }])),
  minecart: () => { const t = new Tex('cart').clear(); t.rect(2, 5, 12, 6, hex(0x6a6a72)); t.rect(3, 6, 10, 2, hex(0x3a3a40)); t.ellipse(4.5, 12, 1.6, 1.6, hex(0x2a2a2a)); t.ellipse(11.5, 12, 1.6, 1.6, hex(0x2a2a2a)); t.outline(hex(0x1a1a1e)); return t; },
  fishing_rod: () => { const t = new Tex('rod').clear(); for (let i = 0; i < 11; i++) t.set(3 + i, 13 - i, hex(0x8a6436)); t.line(13, 3, 13, 12, hex(0xe0e0e0)); t.rect(12, 12, 2, 2, hex(0x8a8a8a)); t.outline(hex(0x2a1c0c)); return t; },
  elytra: () => { const t = new Tex('elytra').clear(); for (let y = 0; y < 13; y++) for (let x = 0; x < 7; x++) if (x < 7 - y * 0.25) { t.set(1 + x, 1 + y, shade(hex(0x8a8aa8), 0.85 + (x + y) % 3 * 0.08)); t.set(14 - x, 1 + y, shade(hex(0x8a8aa8), 0.85 + (x + y) % 3 * 0.08)); } t.line(4, 2, 2, 12, hex(0x5a5a78)); t.line(11, 2, 13, 12, hex(0x5a5a78)); t.outline(hex(0x3a3a50)); return t; },
  firework_rocket: () => { const t = new Tex('rocket').clear(); t.rect(6, 4, 4, 9, hex(0xc83a2a)); t.rect(6, 6, 4, 2, hex(0xe8e8e8)); t.rect(7, 2, 2, 2, hex(0xe8d8a8)); t.line(8, 13, 8, 15, hex(0x8a6436)); t.outline(hex(0x3a1010)); return t; },
  carrot_on_a_stick: () => { const t = itemSpriteDefs.fishing_rod(); t.rect(12, 12, 3, 3, hex(0xf08a1a)); return t; },
  lead: () => { const t = new Tex('lead').clear(); t.ellipse(8, 8, 5, 5, hex(0xa08050)); t.ellipse(8, 8, 3, 3, [0, 0, 0], 0); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (t.alpha(x, y) && (x - 8) ** 2 + (y - 8) ** 2 < 9) t.set(x, y, [0, 0, 0], 0); t.outline(hex(0x4a3a20)); return t; },
  cod: () => blob('cod', 0xb8a080, 6, 3, 8, 8, (t) => { t.rect(13, 6, 2, 4, hex(0x8a7050)); t.set(4, 7, [20, 20, 20]); }),
  cooked_cod: () => blob('ccod', 0xd8b080, 6, 3, 8, 8, (t) => t.rect(13, 6, 2, 4, hex(0xa88050))),
  salmon: () => blob('salmon', 0xc84a3a, 6, 3, 8, 8, (t) => { t.rect(13, 6, 2, 4, hex(0x8a3a2a)); t.set(4, 7, [20, 20, 20]); }),
  cooked_salmon: () => blob('csalmon', 0xe08a5a, 6, 3, 8, 8),
  tropical_fish: () => blob('tfish', 0xf08a1a, 5, 4, 8, 8, (t) => { t.rect(6, 4, 2, 8, hex(0xf0f0f0)); t.set(4, 7, [20, 20, 20]); }),
  pufferfish: () => blob('puffer', 0xe8c040, 5, 5, 8, 8, (t) => { for (let i = 0; i < 10; i++) t.set((t.r() * 16) | 0, (t.r() * 16) | 0, hex(0xf0f0c0)); t.set(5, 6, [20, 20, 20]); }),
  rabbit: () => food('rab', 0xd8907a),
  cooked_rabbit: () => food('crab', 0xb8703a, 'meat', true),
  cookie: () => blob('cookie', 0xc88a4a, 5, 5, 8, 8, (t) => { for (const [x, y] of [[6, 6], [10, 8], [7, 10]]) t.rect(x, y, 2, 1, hex(0x4a2a10)); }),
  pumpkin_pie: () => blob('pie', 0xd8a050, 6, 4, 8, 9, (t) => t.ellipse(8, 8, 4, 2.5, hex(0xe08a20))),
  sweet_berries: () => blob('berry', 0xc02040, 3, 3, 6, 9, (t) => t.ellipse(10, 8, 3, 3, hex(0xc02040))),
  dried_kelp: () => blob('kelp', 0x3a4a2a, 3, 6, 8, 8),
  beetroot: () => blob('beet', 0x8a1a2a, 4, 5, 8, 9, (t) => t.line(8, 2, 8, 5, hex(0x3a8a2a))),
  honey_bottle: () => { const t = itemSpriteDefs.glass_bottle(); t.ellipse(8, 11, 3.2, 3.2, hex(0xf0a020)); return t; },
  totem: () => blob('totem', 0xf0d050, 4, 6, 8, 8),
  bowl: () => { const t = new Tex('bowl').clear(); t.ellipse(8, 9, 6, 3.5, hex(0x8a6436)); t.rect(3, 6, 10, 2, [0, 0, 0], 0); t.rect(2, 7, 12, 1, hex(0xa2834f)); t.outline(hex(0x3a2810)); return t; },
  mushroom_stew: () => { const t = itemSpriteDefs.bowl(); t.rect(3, 7, 10, 1, hex(0xc89a6a)); return t; },
  compass: () => blob('compass', 0x9a9a9a, 5, 5, 8, 8, (t) => { t.ellipse(8, 8, 3.5, 3.5, hex(0xe0e0e0)); t.line(8, 8, 8, 5, hex(0xd02020)); }),
  clock: () => blob('clock', 0xf0c830, 5, 5, 8, 8, (t) => { t.ellipse(8, 8, 3.5, 3.5, hex(0x3a5ad8)); t.rect(5, 8, 7, 3, hex(0x3a8a2a)); }),
  saddle: () => blob('saddle', 0x8a4a2a, 6, 4, 8, 9),
  ink_sac: () => blob('ink', 0x2a2a3a, 4.5, 5, 8, 8),
};
for (const kind of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) for (const m of ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite']) itemSpriteDefs[`${m}_${kind}`] = () => toolSprite(kind, m);
for (const kind of ['helmet', 'chestplate', 'leggings', 'boots']) for (const m of ['leather', 'chainmail', 'iron', 'golden', 'diamond', 'netherite']) itemSpriteDefs[`${m}_${kind}`] = () => toolSprite(kind, m);

export const SPAWN_EGG_COLORS = {
  pig: [0xf0a8a0, 0xc86a64], cow: [0x4a3a2a, 0xe0e0e0], sheep: [0xe8e8e8, 0xc8b8a8], chicken: [0xf0f0f0, 0xd02020],
  wolf: [0xd0ccc8, 0x9a8a7a], horse: [0x8a5a32, 0x3a2a1a], villager: [0x5a7a3a, 0xc89878], zombie: [0x7a8a6a, 0x6a4a2a],
  skeleton: [0xd0d0d0, 0x5a5a5a], creeper: [0x4f7a3a, 0xffb020], spider: [0x342d27, 0xd81a1a], enderman: [0x1c2240, 0x40f0ff],
  slime: [0x7ebf6e, 0x3a7a2a], zombified_piglin: [0x8a8078, 0xff8a1a], ghast: [0xd8c8f0, 0xd02040], blaze: [0x3a2a26, 0xff7a1a],
  ender_dragon: [0x2a1e30, 0xff9a20], iron_golem: [0xb8b0a8, 0x6a8a3a], witch: [0x3a1a3a, 0x6aa040],
};
for (const [m, [a, b]] of Object.entries(SPAWN_EGG_COLORS)) itemSpriteDefs[m + '_spawn_egg'] = () => spawnEgg(m + 'egg', a, b);

const itemCanvases = {};
for (const [name, fn] of Object.entries(itemSpriteDefs)) {
  const t = fn();
  const c = document.createElement('canvas'); c.width = c.height = S;
  c.getContext('2d').putImageData(new ImageData(t.d, S, S), 0, 0);
  itemCanvases[name] = c;
}
export function itemSpriteCanvas(name) { return itemCanvases[name]; }
export function hasItemSprite(name) { return !!itemCanvases[name]; }
