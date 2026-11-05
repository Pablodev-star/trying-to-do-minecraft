// Box models for every mob, built from scratch with procedural skins.
import * as THREE from '../lib/three.module.min.js';
import { hex } from './textures.js';
import { mulberry32, hashString } from './noise.js';

const texCache = new Map();
function skin(color, seed, opts = {}) {
  const key = color + ':' + seed + ':' + JSON.stringify(opts);
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const g = c.getContext('2d');
  const r = mulberry32(hashString(key));
  const base = hex(color);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const f = 1 + (r() - 0.5) * (opts.v ?? 0.16);
    let col = base.map((v) => Math.max(0, Math.min(255, v * f)));
    if (opts.spots && r() < opts.spots[1]) col = hex(opts.spots[0]);
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
function faceTex(color, draw, seed) {
  const key = 'face:' + seed;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const g = c.getContext('2d');
  const r = mulberry32(hashString(key));
  const base = hex(color);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const f = 1 + (r() - 0.5) * 0.14;
    g.fillStyle = `rgb(${base.map((v) => Math.min(255, v * f) | 0).join(',')})`;
    g.fillRect(x, y, 1, 1);
  }
  const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(x, y, w, h); };
  draw(px);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// part: { n, s:[w,h,d] px, p:[x,y,z] pivot px, o:[x,y,z] box centre offset px, c: color, face?: fn, skin?: opts, r?: [rx,ry,rz], transparent? }
function part(spec) {
  return spec;
}

const humanoidLegs = (col, h = 12) => [
  part({ n: 'leg0', s: [4, h, 4], p: [-2, h, 0], o: [0, -h / 2, 0], c: col }),
  part({ n: 'leg1', s: [4, h, 4], p: [2, h, 0], o: [0, -h / 2, 0], c: col }),
];
const humanoid = (head, headFace, body, arms, legs, opts = {}) => [
  part({ n: 'head', s: [8, 8, 8], p: [0, 24, 0], o: [0, 4, 0], c: head, face: headFace }),
  part({ n: 'body', s: [8, 12, 4], p: [0, 24, 0], o: [0, -6, 0], c: body }),
  part({ n: 'arm0', s: [opts.armW ?? 4, 12, opts.armW ?? 4], p: [-6, 22, 0], o: [0, -4, 0], c: arms, r: opts.armsForward ? [-Math.PI / 2, 0, 0] : undefined }),
  part({ n: 'arm1', s: [opts.armW ?? 4, 12, opts.armW ?? 4], p: [6, 22, 0], o: [0, -4, 0], c: arms, r: opts.armsForward ? [-Math.PI / 2, 0, 0] : undefined }),
  ...humanoidLegs(legs),
];

const eyes = (white, pupil, y = 3, nose) => (px) => { px(1, y, white, 2, 1); px(5, y, white, 2, 1); px(2, y, pupil); px(5, y, pupil); if (nose) nose(px); };

export const MODELS = {
  pig: [
    part({ n: 'body', s: [10, 8, 16], p: [0, 10, 0], o: [0, 3, 0], c: 0xf0a5a2 }),
    part({ n: 'head', s: [8, 8, 8], p: [0, 12, 8], o: [0, 0, 4], c: 0xf0a5a2, face: (px) => { px(0, 2, 0xffffff); px(1, 2, 0x000000); px(6, 2, 0x000000); px(7, 2, 0xffffff); px(2, 4, 0xe8857f, 4, 3); px(3, 5, 0x9a4a46); px(4, 5, 0x9a4a46); } }),
    part({ n: 'leg0', s: [4, 6, 4], p: [-3, 6, 5], o: [0, -3, 0], c: 0xe8958f }), part({ n: 'leg1', s: [4, 6, 4], p: [3, 6, 5], o: [0, -3, 0], c: 0xe8958f }),
    part({ n: 'leg2', s: [4, 6, 4], p: [-3, 6, -5], o: [0, -3, 0], c: 0xe8958f }), part({ n: 'leg3', s: [4, 6, 4], p: [3, 6, -5], o: [0, -3, 0], c: 0xe8958f }),
  ],
  cow: [
    part({ n: 'body', s: [12, 10, 18], p: [0, 12, 0], o: [0, 5, 0], c: 0x443626, skin: { spots: [0xe8e8e8, 0.3] } }),
    part({ n: 'head', s: [8, 8, 6], p: [0, 20, 9], o: [0, 0, 3], c: 0x443626, face: (px) => { px(1, 2, 0xffffff); px(2, 2, 0x000000); px(5, 2, 0x000000); px(6, 2, 0xffffff); px(2, 5, 0xbfa294, 4, 3); px(2, 6, 0x5a4a3a); px(5, 6, 0x5a4a3a); px(0, 0, 0xe8e8e8, 3, 1); } }),
    part({ n: 'horn0', s: [1, 3, 1], p: [-4.5, 24, 10], o: [0, 1, 0], c: 0xd8d0c0 }), part({ n: 'horn1', s: [1, 3, 1], p: [4.5, 24, 10], o: [0, 1, 0], c: 0xd8d0c0 }),
    part({ n: 'leg0', s: [4, 12, 4], p: [-4, 12, 6], o: [0, -6, 0], c: 0x3a2c1e }), part({ n: 'leg1', s: [4, 12, 4], p: [4, 12, 6], o: [0, -6, 0], c: 0x3a2c1e }),
    part({ n: 'leg2', s: [4, 12, 4], p: [-4, 12, -6], o: [0, -6, 0], c: 0x3a2c1e }), part({ n: 'leg3', s: [4, 12, 4], p: [4, 12, -6], o: [0, -6, 0], c: 0x3a2c1e }),
  ],
  sheep: [
    part({ n: 'body', s: [12, 11, 18], p: [0, 12, 0], o: [0, 5, 0], c: 0xe9ecec, skin: { v: 0.08 }, tag: 'wool' }),
    part({ n: 'head', s: [6, 6, 8], p: [0, 18, 9], o: [0, 0, 3], c: 0xc8b8a8, face: (px) => { px(0, 0, 0xe9ecec, 8, 2); px(1, 3, 0x000000); px(6, 3, 0x000000); px(3, 5, 0xe8a8a8, 2, 1); } }),
    part({ n: 'leg0', s: [4, 12, 4], p: [-3, 12, 6], o: [0, -6, 0], c: 0xd8c8b8 }), part({ n: 'leg1', s: [4, 12, 4], p: [3, 12, 6], o: [0, -6, 0], c: 0xd8c8b8 }),
    part({ n: 'leg2', s: [4, 12, 4], p: [-3, 12, -6], o: [0, -6, 0], c: 0xd8c8b8 }), part({ n: 'leg3', s: [4, 12, 4], p: [3, 12, -6], o: [0, -6, 0], c: 0xd8c8b8 }),
  ],
  chicken: [
    part({ n: 'body', s: [6, 6, 8], p: [0, 5, 0], o: [0, 3, 0], c: 0xf8f8f8 }),
    part({ n: 'head', s: [4, 6, 3], p: [0, 9, 4], o: [0, 3, 1], c: 0xf8f8f8, face: (px) => { px(0, 2, 0x000000); px(7, 2, 0x000000); } }),
    part({ n: 'beak', s: [4, 2, 2], p: [0, 9, 4], o: [0, 3.5, 3.5], c: 0xf0a020 }),
    part({ n: 'wattle', s: [2, 2, 2], p: [0, 9, 4], o: [0, 1.5, 3], c: 0xd02020 }),
    part({ n: 'wing0', s: [1, 4, 6], p: [-3.5, 9, 0], o: [0, -2, 0], c: 0xe8e8e8 }), part({ n: 'wing1', s: [1, 4, 6], p: [3.5, 9, 0], o: [0, -2, 0], c: 0xe8e8e8 }),
    part({ n: 'leg0', s: [1, 5, 1], p: [-1.5, 5, 0], o: [0, -2.5, 0], c: 0xf0b030 }), part({ n: 'leg1', s: [1, 5, 1], p: [1.5, 5, 0], o: [0, -2.5, 0], c: 0xf0b030 }),
  ],
  wolf: [
    part({ n: 'body', s: [6, 6, 9], p: [0, 8, -1], o: [0, 3, 0], c: 0xd7d3d3 }),
    part({ n: 'mane', s: [8, 7, 6], p: [0, 8, 3], o: [0, 3.5, 0], c: 0xc8c4c4 }),
    part({ n: 'head', s: [6, 6, 4], p: [0, 12, 6], o: [0, 0, 2], c: 0xd7d3d3, face: (px) => { px(1, 3, 0x000000); px(6, 3, 0x000000); } }),
    part({ n: 'snout', s: [3, 3, 4], p: [0, 12, 6], o: [0, -1.5, 5.5], c: 0xb8b4b4 }),
    part({ n: 'ear0', s: [2, 2, 1], p: [-2, 15, 6], o: [0, 1, 1], c: 0xb8b4b4 }), part({ n: 'ear1', s: [2, 2, 1], p: [2, 15, 6], o: [0, 1, 1], c: 0xb8b4b4 }),
    part({ n: 'tail', s: [2, 2, 8], p: [0, 12, -5], o: [0, 0, -4], c: 0xc8c4c4, r: [0.6, 0, 0] }),
    part({ n: 'leg0', s: [2, 8, 2], p: [-1.5, 8, 3], o: [0, -4, 0], c: 0xc8c4c4 }), part({ n: 'leg1', s: [2, 8, 2], p: [1.5, 8, 3], o: [0, -4, 0], c: 0xc8c4c4 }),
    part({ n: 'leg2', s: [2, 8, 2], p: [-1.5, 8, -4], o: [0, -4, 0], c: 0xc8c4c4 }), part({ n: 'leg3', s: [2, 8, 2], p: [1.5, 8, -4], o: [0, -4, 0], c: 0xc8c4c4 }),
  ],
  horse: [
    part({ n: 'body', s: [10, 10, 22], p: [0, 13, 0], o: [0, 5, 0], c: 0x8a5a32 }),
    part({ n: 'neck', s: [4, 12, 7], p: [0, 20, 9], o: [0, 4, 1], c: 0x8a5a32, r: [0.5, 0, 0] }),
    part({ n: 'head', s: [6, 5, 10], p: [0, 30, 13], o: [0, 0, 3], c: 0x8a5a32, face: (px) => { px(1, 2, 0x000000); px(6, 2, 0x000000); } }),
    part({ n: 'mane', s: [2, 14, 2], p: [0, 22, 7], o: [0, 5, -1], c: 0x3a2a1a, r: [0.5, 0, 0] }),
    part({ n: 'tail', s: [3, 10, 3], p: [0, 21, -11], o: [0, -5, 0], c: 0x3a2a1a, r: [0.4, 0, 0] }),
    part({ n: 'leg0', s: [4, 13, 4], p: [-3, 13, 8], o: [0, -6.5, 0], c: 0x7a4a2a }), part({ n: 'leg1', s: [4, 13, 4], p: [3, 13, 8], o: [0, -6.5, 0], c: 0x7a4a2a }),
    part({ n: 'leg2', s: [4, 13, 4], p: [-3, 13, -8], o: [0, -6.5, 0], c: 0x7a4a2a }), part({ n: 'leg3', s: [4, 13, 4], p: [3, 13, -8], o: [0, -6.5, 0], c: 0x7a4a2a }),
  ],
  villager: [
    part({ n: 'head', s: [8, 9, 8], p: [0, 24, 0], o: [0, 4.5, 0], c: 0xc89878, face: (px) => { px(0, 0, 0x4a6a2a, 8, 2); px(1, 3, 0x3a2a1a, 2, 1); px(5, 3, 0x3a2a1a, 2, 1); px(2, 4, 0x2a4a8a); px(5, 4, 0x2a4a8a); px(3, 6, 0x8a5a4a, 2, 1); } }),
    part({ n: 'hood', s: [9, 3, 9], p: [0, 32, 0], o: [0, 1, 0], c: 0x4a6a2a }),
    part({ n: 'body', s: [8, 12, 6], p: [0, 24, 0], o: [0, -6, 0], c: 0x5a7a3a }),
    part({ n: 'robe', s: [8, 6, 6], p: [0, 12, 0], o: [0, -3, 0], c: 0x8a6a3a }),
    part({ n: 'arms', s: [8, 4, 4], p: [0, 20, 2], o: [0, 0, 1], c: 0x6a8a4a, r: [-0.75, 0, 0] }),
    ...humanoidLegs(0x6a4a2a, 12),
  ],
  // Zombie villager (original design): villager silhouette with ashen-green skin and a torn, faded robe
  zombie_villager: [
    part({ n: 'head', s: [8, 9, 8], p: [0, 24, 0], o: [0, 4.5, 0], c: 0x7a9a6a, face: (px) => { px(1, 3, 0x2a3a1a, 2, 1); px(5, 3, 0x2a3a1a, 2, 1); px(2, 4, 0xc8d040); px(5, 4, 0xc8d040); px(2, 6, 0x3a4a2a, 4, 1); px(0, 0, 0x5a7a4a, 3, 1); } }),
    part({ n: 'hood', s: [9, 3, 9], p: [0, 32, 0], o: [0, 1, 0], c: 0x4a4a3a }),
    part({ n: 'body', s: [8, 12, 6], p: [0, 24, 0], o: [0, -6, 0], c: 0x5a5a4a, skin: { spots: [0x3a3a2a, 0.2] } }),
    part({ n: 'robe', s: [8, 6, 6], p: [0, 12, 0], o: [0, -3, 0], c: 0x4a4a3a, skin: { spots: [0x2a2a22, 0.25] } }),
    part({ n: 'arm0', s: [4, 12, 4], p: [-6, 22, 0], o: [0, -4, 0], c: 0x7a9a6a, r: [-Math.PI / 2, 0, 0] }),
    part({ n: 'arm1', s: [4, 12, 4], p: [6, 22, 0], o: [0, -4, 0], c: 0x7a9a6a, r: [-Math.PI / 2, 0, 0] }),
    ...humanoidLegs(0x3a3a32, 12),
  ],
  zombie: humanoid(0x7a8a6a, eyes(0xd8d040, 0x3a2a0a, 3, (px) => { px(2, 6, 0x3a3a2a, 4, 1); px(1, 0, 0x5a6a4a, 3, 1); }), 0x6a4a2a, 0x7a8a6a, 0x3a3a42, { armsForward: true }),
  skeleton: humanoid(0xc1c1c1, (px) => { px(1, 3, 0x2a2a2a, 2, 2); px(5, 3, 0x2a2a2a, 2, 2); px(2, 6, 0x5a5a5a, 4, 1); px(3, 5, 0x3a3a3a, 2, 1); }, 0xb8b8b8, 0xc1c1c1, 0xb0b0b0, { armW: 2, armsForward: true }),
  // Ash ghoul of the Nether (original design): ashen skin, ember eyes, charred tunic.
  zombified_piglin: humanoid(0x8a8078, (px) => { px(1, 3, 0xff8a1a, 2, 1); px(5, 3, 0xff8a1a, 2, 1); px(2, 6, 0x3a3030, 4, 1); px(0, 0, 0x5a504a, 8, 1); }, 0x4a2a22, 0x8a8078, 0x2a2224, { armsForward: true }),
  witch: [
    ...humanoid(0xbd8b72, (px) => { px(1, 4, 0x2a7a3a); px(6, 4, 0x2a7a3a); px(3, 5, 0xa07060, 2, 2); }, 0x340000, 0x6a4c3f, 0x340000).filter((p) => p.n !== 'arm0' && p.n !== 'arm1'),
    part({ n: 'hat', s: [10, 2, 10], p: [0, 32, 0], o: [0, 1, 0], c: 0x2a3a1a }),
    part({ n: 'hat2', s: [6, 6, 6], p: [0, 34, 0], o: [0, 3, 0], c: 0x2a3a1a }),
    part({ n: 'arms', s: [8, 4, 4], p: [0, 20, 2], o: [0, 0, 1], c: 0x5a1a1a, r: [-0.75, 0, 0] }),
  ],
  creeper: [
    part({ n: 'head', s: [10, 8, 10], p: [0, 14, 0], o: [0, 4, 0], c: 0x4f7a3a, skin: { spots: [0x8a9a5a, 0.3] }, face: (px) => { px(1, 2, 0xffb020, 2, 2); px(5, 2, 0xffb020, 2, 2); px(2, 3, 0x5a2a00); px(5, 3, 0x5a2a00); px(1, 5, 0x1a2a10, 6, 1); px(2, 6, 0xd8d8c0); px(4, 6, 0xd8d8c0); px(6, 6, 0xd8d8c0); } }),
    part({ n: 'crest', s: [6, 3, 6], p: [0, 22, 0], o: [0, 1.5, 0], c: 0x6a9a3a, skin: { spots: [0xc84a2a, 0.15] } }),
    part({ n: 'body', s: [8, 8, 6], p: [0, 14, 0], o: [0, -4, 0], c: 0x5a6a3a, skin: { spots: [0x3a4a2a, 0.3] } }),
    part({ n: 'leg0', s: [3, 6, 3], p: [-3, 6, 3], o: [0, -3, 0], c: 0x3a4a2a }), part({ n: 'leg1', s: [3, 6, 3], p: [3, 6, 3], o: [0, -3, 0], c: 0x3a4a2a }),
    part({ n: 'leg2', s: [3, 6, 3], p: [-3, 6, -3], o: [0, -3, 0], c: 0x3a4a2a }), part({ n: 'leg3', s: [3, 6, 3], p: [3, 6, -3], o: [0, -3, 0], c: 0x3a4a2a }),
  ],
  spider: [
    part({ n: 'body', s: [10, 8, 12], p: [0, 9, -5], o: [0, 0, -3], c: 0x342d27 }),
    part({ n: 'neck', s: [6, 6, 6], p: [0, 9, 0], o: [0, 0, 0], c: 0x2a241f }),
    part({ n: 'head', s: [8, 8, 8], p: [0, 9, 3], o: [0, 0, 4], c: 0x342d27, face: (px) => { px(1, 3, 0xd81a1a, 2, 1); px(5, 3, 0xd81a1a, 2, 1); px(2, 2, 0xd81a1a); px(5, 2, 0xd81a1a); }, glow: (px) => { px(1, 3, 0xff3a2a, 2, 1); px(5, 3, 0xff3a2a, 2, 1); px(2, 2, 0xff3a2a); px(5, 2, 0xff3a2a); } }),
    ...[0, 1, 2, 3].flatMap((i) => [
      part({ n: 'sleg' + (i * 2), s: [16, 2, 2], p: [-4, 9, 2 - i * 2], o: [-8, 0, 0], c: 0x2a241f, r: [0, (i - 1.5) * 0.35, -0.6] }),
      part({ n: 'sleg' + (i * 2 + 1), s: [16, 2, 2], p: [4, 9, 2 - i * 2], o: [8, 0, 0], c: 0x2a241f, r: [0, -(i - 1.5) * 0.35, 0.6] }),
    ]),
  ],
  enderman: [
    part({ n: 'head', s: [8, 8, 8], p: [0, 38, 0], o: [0, 4, 0], c: 0x1c2240, face: (px) => { px(1, 3, 0x40f0ff, 6, 1); px(2, 4, 0x20a0c0, 4, 1); }, glow: (px) => { px(1, 3, 0x60f8ff, 6, 1); px(2, 4, 0x30b8d8, 4, 1); } }),
    part({ n: 'body', s: [8, 12, 4], p: [0, 38, 0], o: [0, -6, 0], c: 0x232a4a }),
    part({ n: 'arm0', s: [2, 30, 2], p: [-5, 36, 0], o: [0, -13, 0], c: 0x1c2240 }), part({ n: 'arm1', s: [2, 30, 2], p: [5, 36, 0], o: [0, -13, 0], c: 0x1c2240 }),
    part({ n: 'leg0', s: [2, 26, 2], p: [-2, 26, 0], o: [0, -13, 0], c: 0x1c2240 }), part({ n: 'leg1', s: [2, 26, 2], p: [2, 26, 0], o: [0, -13, 0], c: 0x1c2240 }),
  ],
  slime: [
    part({ n: 'inner', s: [6, 6, 6], p: [0, 0, 0], o: [0, 4, 0], c: 0x51a03e, face: (px) => { px(1, 2, 0x1a3a1a, 2, 2); px(5, 2, 0x1a3a1a, 2, 2); px(4, 5, 0x1a3a1a); } }),
    part({ n: 'body', s: [8, 8, 8], p: [0, 0, 0], o: [0, 4, 0], c: 0x7ebf6e, transparent: true }),
  ],
  ghast: [
    part({ n: 'body', s: [16, 16, 16], p: [0, 8, 0], o: [0, 8, 0], c: 0xd8c8f0, skin: { spots: [0xb8a0e0, 0.2] }, face: (px) => { px(2, 2, 0xffffff, 4, 3); px(3, 3, 0xd02040, 2, 2); px(2, 6, 0x8a6aa8, 4, 1); } }),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => part({ n: 'tent' + i, s: [2, 9 + (i % 3) * 2, 2], p: [-5 + (i % 3) * 5, 8, -5 + Math.floor(i / 3) * 5], o: [0, -5, 0], c: 0xc8b0e8 })),
  ],
  blaze: [
    part({ n: 'head', s: [8, 8, 8], p: [0, 18, 0], o: [0, 4, 0], c: 0x3a2a26, skin: { spots: [0xff7a1a, 0.18] }, face: (px) => { px(1, 3, 0xffe060, 2, 1); px(5, 3, 0xffe060, 2, 1); px(3, 5, 0xff7a1a, 2, 1); } }),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => part({ n: 'rod' + i, s: [3, 3, 3], p: [Math.cos(i / 4 * Math.PI) * (i < 4 ? 8 : 5), i < 4 ? 14 : 6, Math.sin(i / 4 * Math.PI) * (i < 4 ? 8 : 5)], o: [0, 0, 0], c: 0xff6a10 })),
  ],
  iron_golem: [
    part({ n: 'head', s: [8, 10, 8], p: [0, 32, -2], o: [0, 5, 0], c: 0xdbcdc2, face: (px) => { px(1, 3, 0x8a2a2a); px(6, 3, 0x8a2a2a); px(0, 2, 0x8a8a7a, 8, 1); } }),
    part({ n: 'nose', s: [2, 4, 2], p: [0, 32, 2], o: [0, 3, 1], c: 0xc8b8ac }),
    part({ n: 'body', s: [18, 12, 11], p: [0, 32, 0], o: [0, -6, 0], c: 0xdbcdc2, skin: { spots: [0x74a332, 0.08] } }),
    part({ n: 'waist', s: [9, 5, 6], p: [0, 20, 0], o: [0, -2.5, 0], c: 0xc8b8ac }),
    part({ n: 'arm0', s: [4, 30, 6], p: [-11, 30, 0], o: [0, -13, 0], c: 0xdbcdc2 }), part({ n: 'arm1', s: [4, 30, 6], p: [11, 30, 0], o: [0, -13, 0], c: 0xdbcdc2 }),
    part({ n: 'leg0', s: [6, 16, 5], p: [-4, 16, 0], o: [0, -8, 0], c: 0xc8b8ac }), part({ n: 'leg1', s: [6, 16, 5], p: [4, 16, 0], o: [0, -8, 0], c: 0xc8b8ac }),
  ],
  ender_dragon: [
    part({ n: 'body', s: [24, 24, 64], p: [0, 24, 0], o: [0, 0, 0], c: 0x2a1e30, skin: { spots: [0x4a3a50, 0.2] } }),
    ...[0, 1, 2, 3, 4].map((i) => part({ n: 'neck' + i, s: [10, 10, 10], p: [0, 26 + i * 2, 34 + i * 10], o: [0, 0, 0], c: 0x1c1c1c })),
    part({ n: 'head', s: [16, 16, 16], p: [0, 38, 90], o: [0, 0, 0], c: 0x1c1c1c, face: (px) => { px(1, 2, 0xff9a20, 2, 1); px(5, 2, 0xff9a20, 2, 1); px(0, 6, 0x0a0a0a, 8, 1); } }),
    part({ n: 'jaw', s: [12, 4, 16], p: [0, 30, 100], o: [0, 0, 0], c: 0x141414 }),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => part({ n: 'tail' + i, s: [10, 10, 10], p: [0, 24 - i, -36 - i * 10], o: [0, 0, 0], c: 0x1c1c1c })),
    part({ n: 'wing0', s: [56, 4, 40], p: [-12, 30, 10], o: [-28, 0, 0], c: 0x2a2a2a, transparent: true }),
    part({ n: 'wing1', s: [56, 4, 40], p: [12, 30, 10], o: [28, 0, 0], c: 0x2a2a2a, transparent: true }),
    part({ n: 'leg0', s: [8, 20, 8], p: [-10, 12, 20], o: [0, -10, 0], c: 0x141414 }), part({ n: 'leg1', s: [8, 20, 8], p: [10, 12, 20], o: [0, -10, 0], c: 0x141414 }),
    part({ n: 'leg2', s: [8, 20, 8], p: [-10, 12, -20], o: [0, -10, 0], c: 0x141414 }), part({ n: 'leg3', s: [8, 20, 8], p: [10, 12, -20], o: [0, -10, 0], c: 0x141414 }),
  ],
  // Original explorer character: black hair with a headband, orange jacket, dark trousers.
  player: humanoid(0xd8a47f, (px) => { px(0, 0, 0x1a1a1a, 8, 2); px(0, 2, 0xc83a2a, 8, 1); px(1, 4, 0xffffff); px(2, 4, 0x2a6a3a); px(5, 4, 0x2a6a3a); px(6, 4, 0xffffff); px(3, 6, 0xa86a50, 2, 1); }, 0xe07a1a, 0xd8a47f, 0x2e2e38),
};

// ---------------------------------------------------------------- new mobs (original box designs)
const quad = (body, head, face, legH, legC, opts = {}) => [
  part({ n: 'body', s: opts.bs ?? [8, 7, 13], p: [0, legH, 0], o: [0, (opts.bs?.[1] ?? 7) / 2, 0], c: body, skin: opts.skin }),
  part({ n: 'head', s: opts.hs ?? [7, 6, 6], p: [0, legH + (opts.bs?.[1] ?? 7) - 1, (opts.bs?.[2] ?? 13) / 2], o: [0, 1, 2.5], c: head, face }),
  ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz], i) => part({ n: 'leg' + i, s: [opts.lw ?? 3, legH, opts.lw ?? 3], p: [sx * ((opts.bs?.[0] ?? 8) / 2 - 1.5), legH, sz * ((opts.bs?.[2] ?? 13) / 2 - 2)], o: [0, -legH / 2, 0], c: legC })),
  ...(opts.extra ?? []),
];
Object.assign(MODELS, {
  fox: quad(0xe07a2a, 0xe07a2a, (px) => { px(0, 4, 0xf0f0f0, 2, 2); px(6, 4, 0xf0f0f0, 2, 2); px(1, 2, 0x1a1a1a); px(6, 2, 0x1a1a1a); px(3, 5, 0x1a1a1a, 2, 1); }, 5, 0x3a2a1a, { bs: [6, 6, 11], hs: [7, 6, 5], lw: 2, extra: [part({ n: 'ear0', s: [2, 3, 1], p: [-2, 15, 7], o: [0, 1.5, 0], c: 0xe07a2a }), part({ n: 'ear1', s: [2, 3, 1], p: [2, 15, 7], o: [0, 1.5, 0], c: 0xe07a2a }), part({ n: 'tail', s: [4, 4, 9], p: [0, 9, -5], o: [0, 0, -4], c: 0xe8e0d8, r: [0.4, 0, 0] })] }),
  rabbit: [
    part({ n: 'body', s: [5, 5, 7], p: [0, 2, 0], o: [0, 2.5, 0], c: 0xa88a6a }),
    part({ n: 'head', s: [4, 4, 4], p: [0, 6, 3], o: [0, 1, 2], c: 0xa88a6a, face: (px) => { px(1, 3, 0x1a1a1a); px(6, 3, 0x1a1a1a); px(3, 5, 0xe8a0a0, 2, 1); } }),
    part({ n: 'ear0', s: [1, 5, 2], p: [-1, 9, 3], o: [0, 2.5, 0], c: 0xb89a7a }), part({ n: 'ear1', s: [1, 5, 2], p: [1, 9, 3], o: [0, 2.5, 0], c: 0xb89a7a }),
    part({ n: 'tail', s: [2, 2, 2], p: [0, 4, -4], o: [0, 0, 0], c: 0xf0f0f0 }),
    part({ n: 'leg0', s: [2, 2, 4], p: [-1.5, 2, -1], o: [0, -1, 0], c: 0x98785a }), part({ n: 'leg1', s: [2, 2, 4], p: [1.5, 2, -1], o: [0, -1, 0], c: 0x98785a }),
  ],
  cat: quad(0xc8a070, 0xc8a070, (px) => { px(1, 3, 0x6ac040); px(6, 3, 0x6ac040); px(3, 5, 0xe8a0a0, 2, 1); }, 5, 0xb89060, { bs: [4, 5, 12], hs: [5, 4, 5], lw: 2, skin: { spots: [0x8a6040, 0.25] }, extra: [part({ n: 'tail', s: [1, 1, 8], p: [0, 9, -6], o: [0, 0, -4], c: 0xb89060, r: [0.9, 0, 0] }), part({ n: 'ear0', s: [1, 2, 1], p: [-1.5, 12, 6], o: [0, 1, 0], c: 0xc8a070 }), part({ n: 'ear1', s: [1, 2, 1], p: [1.5, 12, 6], o: [0, 1, 0], c: 0xc8a070 })] }),
  parrot: [
    part({ n: 'body', s: [3, 6, 3], p: [0, 2, 0], o: [0, 3, 0], c: 0xd02020 }),
    part({ n: 'head', s: [3, 3, 3], p: [0, 8, 0.5], o: [0, 1.5, 0], c: 0xd02020, face: (px) => { px(1, 3, 0xf0f0f0); px(6, 3, 0xf0f0f0); px(3, 5, 0xe0c030, 2, 3); } }),
    part({ n: 'wing0', s: [1, 5, 3], p: [-2, 7, 0], o: [0, -2.5, 0], c: 0x2a6ad8 }), part({ n: 'wing1', s: [1, 5, 3], p: [2, 7, 0], o: [0, -2.5, 0], c: 0x2a6ad8 }),
    part({ n: 'tail', s: [3, 4, 1], p: [0, 2, -1.5], o: [0, -2, 0], c: 0xe0c030 }),
    part({ n: 'leg0', s: [1, 2, 1], p: [-1, 2, 0], o: [0, -1, 0], c: 0x5a5a5a }), part({ n: 'leg1', s: [1, 2, 1], p: [1, 2, 0], o: [0, -1, 0], c: 0x5a5a5a }),
  ],
  panda: quad(0xf0f0f0, 0xf0f0f0, (px) => { px(1, 2, 0x1a1a1a, 2, 3); px(5, 2, 0x1a1a1a, 2, 3); px(2, 3, 0xf0f0f0); px(5, 3, 0xf0f0f0); px(3, 6, 0x1a1a1a, 2, 1); }, 9, 0x1a1a1a, { bs: [13, 12, 18], hs: [10, 8, 7], lw: 5, extra: [part({ n: 'ear0', s: [3, 3, 2], p: [-4, 24, 11], o: [0, 1, 0], c: 0x1a1a1a }), part({ n: 'ear1', s: [3, 3, 2], p: [4, 24, 11], o: [0, 1, 0], c: 0x1a1a1a })] }),
  bee: [
    part({ n: 'body', s: [6, 6, 8], p: [0, 4, 0], o: [0, 3, 0], c: 0xe8c030, skin: { spots: [0x2a1a0a, 0.3] }, face: (px) => { px(1, 3, 0x1a1a1a, 2, 2); px(5, 3, 0x1a1a1a, 2, 2); } }),
    part({ n: 'wing0', s: [5, 1, 4], p: [-2, 10, 0], o: [-2.5, 0, 0], c: 0xd8f0ff, transparent: true }), part({ n: 'wing1', s: [5, 1, 4], p: [2, 10, 0], o: [2.5, 0, 0], c: 0xd8f0ff, transparent: true }),
    part({ n: 'sting', s: [1, 1, 2], p: [0, 6, -4], o: [0, 0, -1], c: 0x3a3a3a }),
  ],
  goat: quad(0xe8e4d8, 0xe0dcd0, (px) => { px(1, 3, 0xc8a040); px(6, 3, 0xc8a040); px(2, 6, 0xd0ccc0, 4, 2); }, 9, 0xd8d4c8, { bs: [8, 9, 13], hs: [5, 7, 7], lw: 3, extra: [part({ n: 'horn0', s: [1, 5, 1], p: [-2, 24, 8], o: [0, 2.5, -1], c: 0x8a8a7a, r: [-0.5, 0, 0] }), part({ n: 'horn1', s: [1, 5, 1], p: [2, 24, 8], o: [0, 2.5, -1], c: 0x8a8a7a, r: [-0.5, 0, 0] }), part({ n: 'beard', s: [2, 3, 1], p: [0, 15, 11], o: [0, -1.5, 0], c: 0xd0ccc0 })] }),
  frog: [
    part({ n: 'body', s: [7, 4, 7], p: [0, 2, 0], o: [0, 2, 0], c: 0x5a8a3a }),
    part({ n: 'head', s: [7, 3, 5], p: [0, 5, 1], o: [0, 1.5, 1.5], c: 0x6a9a4a, face: (px) => { px(0, 0, 0x1a1a1a, 2, 2); px(6, 0, 0x1a1a1a, 2, 2); px(1, 5, 0x3a5a2a, 6, 1); } }),
    part({ n: 'eye0', s: [2, 2, 2], p: [-2.5, 8, 2], o: [0, 1, 0], c: 0xe8e8a0 }), part({ n: 'eye1', s: [2, 2, 2], p: [2.5, 8, 2], o: [0, 1, 0], c: 0xe8e8a0 }),
    part({ n: 'leg0', s: [2, 2, 3], p: [-3, 2, -2], o: [0, -1, 0], c: 0x4a7a2a }), part({ n: 'leg1', s: [2, 2, 3], p: [3, 2, -2], o: [0, -1, 0], c: 0x4a7a2a }),
  ],
  turtle: [
    part({ n: 'body', s: [12, 4, 14], p: [0, 2, 0], o: [0, 2, 0], c: 0x3a7a3a, skin: { spots: [0x5a9a4a, 0.3] } }),
    part({ n: 'head', s: [4, 3, 4], p: [0, 3, 7], o: [0, 1, 2], c: 0x6aa85a, face: (px) => { px(1, 3, 0x1a1a1a); px(6, 3, 0x1a1a1a); } }),
    ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz], i) => part({ n: 'leg' + i, s: [4, 1, 3], p: [sx * 6, 1, sz * 5], o: [sx * 1.5, 0, 0], c: 0x6aa85a })),
  ],
  squid: [
    part({ n: 'body', s: [10, 14, 10], p: [0, 6, 0], o: [0, 7, 0], c: 0x2a3a6a, face: (px) => { px(1, 5, 0xf0f0f0, 2, 2); px(5, 5, 0xf0f0f0, 2, 2); px(2, 6, 0x1a1a1a); px(5, 6, 0x1a1a1a); } }),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => part({ n: 'tent' + i, s: [2, 10, 2], p: [Math.cos(i / 4 * Math.PI) * 4, 6, Math.sin(i / 4 * Math.PI) * 4], o: [0, -5, 0], c: 0x1a2a5a })),
  ],
  cod: [part({ n: 'body', s: [2, 4, 7], p: [0, 0, 0], o: [0, 2, 0], c: 0xb8a080, face: (px) => { px(1, 3, 0x1a1a1a); } }), part({ n: 'tail', s: [1, 4, 3], p: [0, 2, -3.5], o: [0, 0, -1.5], c: 0x9a8060 })],
  salmon: [part({ n: 'body', s: [3, 5, 9], p: [0, 0, 0], o: [0, 2.5, 0], c: 0xb84a3a, face: (px) => { px(1, 3, 0x1a1a1a); } }), part({ n: 'tail', s: [1, 5, 3], p: [0, 2.5, -4.5], o: [0, 0, -1.5], c: 0x8a3a2a })],
  tropical_fish: [part({ n: 'body', s: [2, 5, 5], p: [0, 0, 0], o: [0, 2.5, 0], c: 0xf08a1a, skin: { spots: [0xf0f0f0, 0.3] } }), part({ n: 'tail', s: [1, 4, 2], p: [0, 2.5, -2.5], o: [0, 0, -1], c: 0x2a6ad8 })],
  dolphin: [
    part({ n: 'body', s: [8, 7, 14], p: [0, 0, 0], o: [0, 3.5, 0], c: 0x7a8aa0 }),
    part({ n: 'head', s: [6, 6, 6], p: [0, 1, 7], o: [0, 3, 3], c: 0x8a9ab0, face: (px) => { px(1, 3, 0x1a1a1a); px(6, 3, 0x1a1a1a); } }),
    part({ n: 'snout', s: [3, 2, 4], p: [0, 1, 13], o: [0, 1, 2], c: 0xd0d8e0 }),
    part({ n: 'fin', s: [1, 4, 4], p: [0, 7, 0], o: [0, 2, 0], c: 0x6a7a90 }),
    part({ n: 'tail', s: [8, 2, 5], p: [0, 3, -7], o: [0, 0, -2.5], c: 0x6a7a90 }),
  ],
  polar_bear: quad(0xf0f0e8, 0xf0f0e8, (px) => { px(1, 3, 0x1a1a1a); px(6, 3, 0x1a1a1a); px(3, 6, 0x2a2a2a, 2, 1); }, 10, 0xe8e8e0, { bs: [14, 12, 18], hs: [8, 7, 7], lw: 5 }),
  llama: quad(0xe8d8b8, 0xe8d8b8, (px) => { px(1, 3, 0x1a1a1a); px(6, 3, 0x1a1a1a); }, 12, 0xd8c8a8, { bs: [10, 9, 16], hs: [6, 14, 6], lw: 4, extra: [part({ n: 'ear0', s: [2, 3, 1], p: [-2, 36, 9], o: [0, 1.5, 0], c: 0xd8c8a8 }), part({ n: 'ear1', s: [2, 3, 1], p: [2, 36, 9], o: [0, 1.5, 0], c: 0xd8c8a8 })] }),
  // desert mummy (husk-type): bandaged, sand coloured
  husk: humanoid(0xb8a070, (px) => { px(0, 2, 0xd8c8a0, 8, 1); px(0, 5, 0xd8c8a0, 8, 1); px(1, 3, 0x2a1a0a, 2, 1); px(5, 3, 0x2a1a0a, 2, 1); }, 0xc8b890, 0xb8a070, 0x9a8a60, { armsForward: true }),
  // drowned: waterlogged zombie with kelp
  drowned: humanoid(0x4a8a7a, (px) => { px(1, 3, 0x9af0f0); px(6, 3, 0x9af0f0); px(2, 6, 0x2a5a4a, 4, 1); px(0, 0, 0x3a6a2a, 8, 2); }, 0x3a6a5a, 0x4a8a7a, 0x2a4a5a, { armsForward: true }),
  // frost skeleton (stray-type): icy blue rags
  stray: humanoid(0xc8d8e0, (px) => { px(1, 3, 0x2a3a4a, 2, 2); px(5, 3, 0x2a3a4a, 2, 2); px(2, 6, 0x5a6a7a, 4, 1); }, 0x8aa8c0, 0xc8d8e0, 0x7a98b0, { armW: 2, armsForward: true }),
  cave_spider: null, // built from spider at 0.7 scale with a blue tint
  silverfish: [
    ...[0, 1, 2, 3, 4].map((i) => part({ n: 'seg' + i, s: [4 - Math.abs(i - 1) * 0.6, 3, 3], p: [0, 0, 4 - i * 3], o: [0, 1.5, 0], c: 0x8a8a92, face: i === 0 ? (px) => { px(1, 3, 0x1a1a1a); px(6, 3, 0x1a1a1a); } : undefined })),
  ],
  magma_blob: [
    part({ n: 'inner', s: [5, 5, 5], p: [0, 0, 0], o: [0, 4, 0], c: 0xff8a1a }),
    part({ n: 'body', s: [8, 8, 8], p: [0, 0, 0], o: [0, 4, 0], c: 0x4a1a0a, skin: { spots: [0xff6a1a, 0.25] }, face: (px) => { px(1, 3, 0xffd040, 2, 1); px(5, 3, 0xffd040, 2, 1); } }),
  ],
  // ---- original creatures
  // Night wraith: hooded flying spirit that hunts players who don't sleep
  night_wraith: [
    part({ n: 'body', s: [8, 10, 4], p: [0, 6, 0], o: [0, 5, 0], c: 0x2a2a4a, transparent: true }),
    part({ n: 'head', s: [6, 6, 6], p: [0, 16, 0], o: [0, 3, 0], c: 0x1a1a2a, face: (px) => { px(1, 3, 0x7af0ff, 2, 1); px(5, 3, 0x7af0ff, 2, 1); } }),
    part({ n: 'wing0', s: [12, 1, 6], p: [-4, 14, 0], o: [-6, 0, 0], c: 0x3a3a5a, transparent: true }), part({ n: 'wing1', s: [12, 1, 6], p: [4, 14, 0], o: [6, 0, 0], c: 0x3a3a5a, transparent: true }),
    part({ n: 'tail', s: [4, 6, 2], p: [0, 6, 0], o: [0, -3, 0], c: 0x2a2a4a, transparent: true }),
  ],
  // Bandit: masked raider with a bow (outposts)
  bandit: humanoid(0x8a7a6a, (px) => { px(0, 2, 0x2a2a2a, 8, 2); px(1, 3, 0xe8e8e8); px(6, 3, 0xe8e8e8); px(2, 6, 0x5a4a3a, 4, 1); }, 0x4a3a2a, 0x8a7a6a, 0x2a2a32, { armsForward: true }),
  brute: humanoid(0x7a6a5a, (px) => { px(0, 1, 0x3a2a1a, 8, 1); px(1, 3, 0x1a1a1a, 2, 1); px(5, 3, 0x1a1a1a, 2, 1); px(2, 6, 0x3a2a1a, 4, 1); }, 0x5a2a1a, 0x7a6a5a, 0x2a2a2a, { armsForward: true }),
  // Abyssal eel: long armoured eel of the deep ocean that spits water bolts
  abyssal_eel: [
    ...[0, 1, 2, 3, 4, 5].map((i) => part({ n: 'seg' + i, s: [6 - i * 0.6, 6 - i * 0.6, 5], p: [0, 4, 10 - i * 5], o: [0, 0, 0], c: i ? 0x2a4a5a : 0x3a6a7a, skin: { spots: [0x5ac8b8, 0.15] }, face: i === 0 ? (px) => { px(1, 2, 0xf0d040, 2, 2); px(5, 2, 0xf0d040, 2, 2); px(2, 6, 0x0a1a1a, 4, 1); } : undefined })),
    part({ n: 'fin', s: [1, 4, 14], p: [0, 8, 2], o: [0, 1, 0], c: 0x5ac8b8 }),
  ],
  // Purpur sentinel: floating crystal guardian of End cities
  purpur_sentinel: [
    part({ n: 'base', s: [10, 4, 10], p: [0, 0, 0], o: [0, 2, 0], c: 0x8a5f8a }),
    part({ n: 'core', s: [6, 6, 6], p: [0, 6, 0], o: [0, 3, 0], c: 0xe8c8ff, face: (px) => { px(3, 3, 0x2a0a3a, 2, 2); } }),
    part({ n: 'ring', s: [12, 2, 12], p: [0, 9, 0], o: [0, 0, 0], c: 0xab7fab, transparent: true }),
  ],
  // Ash goblin: short nether scavenger that trades gold
  ash_goblin: [
    part({ n: 'head', s: [7, 6, 6], p: [0, 16, 0], o: [0, 3, 0], c: 0x8a8a6a, face: (px) => { px(1, 3, 0xff9a1a); px(6, 3, 0xff9a1a); px(2, 5, 0x3a3a2a, 4, 1); px(0, 1, 0x5a5a4a, 1, 2); px(7, 1, 0x5a5a4a, 1, 2); } }),
    part({ n: 'ear0', s: [3, 2, 1], p: [-4, 19, 0], o: [-1, 0, 0], c: 0x7a7a5a }), part({ n: 'ear1', s: [3, 2, 1], p: [4, 19, 0], o: [1, 0, 0], c: 0x7a7a5a }),
    part({ n: 'body', s: [7, 8, 4], p: [0, 16, 0], o: [0, -4, 0], c: 0x4a2a2a }),
    part({ n: 'arm0', s: [2, 8, 2], p: [-4.5, 15, 0], o: [0, -3, 0], c: 0x8a8a6a }), part({ n: 'arm1', s: [2, 8, 2], p: [4.5, 15, 0], o: [0, -3, 0], c: 0x8a8a6a }),
    ...humanoidLegs(0x3a2a22, 8),
  ],
  // Hellboar: horned beast of the crimson forests
  hellboar: quad(0x7a3a2a, 0x8a4a3a, (px) => { px(1, 2, 0xff6020); px(6, 2, 0xff6020); px(2, 5, 0x5a2a1a, 4, 2); }, 8, 0x5a2a1a, { bs: [12, 10, 18], hs: [9, 8, 8], lw: 4, skin: { spots: [0xa85a3a, 0.2] }, extra: [part({ n: 'horn0', s: [2, 5, 2], p: [-4, 18, 12], o: [0, 2.5, 0], c: 0xe8e0c8 }), part({ n: 'horn1', s: [2, 5, 2], p: [4, 18, 12], o: [0, 2.5, 0], c: 0xe8e0c8 })] }),
  // Lava wader: long-legged bird that walks on lava
  lava_wader: [
    part({ n: 'body', s: [8, 6, 10], p: [0, 18, 0], o: [0, 3, 0], c: 0x8a3a5a }),
    part({ n: 'neck', s: [3, 8, 3], p: [0, 22, 4], o: [0, 4, 0], c: 0x9a4a6a }),
    part({ n: 'head', s: [4, 4, 6], p: [0, 30, 4], o: [0, 2, 2], c: 0x9a4a6a, face: (px) => { px(1, 2, 0xffd040); px(6, 2, 0xffd040); } }),
    part({ n: 'leg0', s: [1, 18, 1], p: [-2, 18, 0], o: [0, -9, 0], c: 0x3a1a2a }), part({ n: 'leg1', s: [1, 18, 1], p: [2, 18, 0], o: [0, -9, 0], c: 0x3a1a2a }),
  ],
  // Charred skeleton: tall burnt skeleton of nether fortresses (withering strikes)
  charred_skeleton: humanoid(0x2a2a2a, (px) => { px(1, 3, 0xff5a1a, 2, 2); px(5, 3, 0xff5a1a, 2, 2); px(2, 6, 0x0a0a0a, 4, 1); }, 0x1e1e1e, 0x2a2a2a, 0x222222, { armW: 2, armsForward: true }),
  // Ash colossus: summoned boss, a hovering mass of ash with three burning cores
  ash_colossus: [
    part({ n: 'body', s: [10, 14, 6], p: [0, 6, 0], o: [0, 7, 0], c: 0x2e2a2a, skin: { spots: [0x5a4a4a, 0.25] } }),
    part({ n: 'head', s: [8, 8, 8], p: [0, 22, 0], o: [0, 4, 0], c: 0x3a3434, face: (px) => { px(1, 3, 0xffb030, 2, 2); px(5, 3, 0xffb030, 2, 2); px(2, 6, 0xff6010, 4, 1); } }),
    part({ n: 'core0', s: [6, 6, 6], p: [-10, 20, 0], o: [0, 3, 0], c: 0x3a3434, face: (px) => { px(2, 3, 0xffb030, 4, 2); } }),
    part({ n: 'core1', s: [6, 6, 6], p: [10, 20, 0], o: [0, 3, 0], c: 0x3a3434, face: (px) => { px(2, 3, 0xffb030, 4, 2); } }),
    part({ n: 'arm0', s: [20, 3, 3], p: [0, 19, 0], o: [0, 0, 0], c: 0x262222 }),
    part({ n: 'tail', s: [4, 10, 3], p: [0, 6, 0], o: [0, -5, 0], c: 0x262222 }),
  ],
});
MODELS.cave_spider = MODELS.spider;

export function buildModel(type, scale = 1) {
  const root = new THREE.Group();
  const parts = {};
  const mats = [];
  const spec = MODELS[type];
  for (const p of spec) {
    const pivot = new THREE.Group();
    pivot.position.set(p.p[0] / 16, p.p[1] / 16, p.p[2] / 16);
    if (p.r) pivot.rotation.set(p.r[0], p.r[1], p.r[2]);
    pivot.userData.baseRot = p.r ? [...p.r] : [0, 0, 0];
    const geo = new THREE.BoxGeometry(p.s[0] / 16, p.s[1] / 16, p.s[2] / 16);
    const base = new THREE.MeshLambertMaterial({ map: skin(p.c, type + p.n, p.skin ?? {}), transparent: !!p.transparent, opacity: p.transparent ? 0.6 : 1 });
    let mat = base;
    if (p.face) {
      const front = new THREE.MeshLambertMaterial({ map: faceTex(p.c, p.face, type + p.n) });
      mat = [base, base, base, base, front, base];
      mats.push(front);
    }
    mats.push(base);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.o[0] / 16, p.o[1] / 16, p.o[2] / 16);
    pivot.add(mesh);
    if (p.glow) {
      // glowing eyes: an unlit decal just in front of the face, so they shine in the dark
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const g = c.getContext('2d');
      p.glow((x, y, col, w = 1, h = 1) => { g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(x, y, w, h); });
      const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
      const eyes = new THREE.Mesh(new THREE.PlaneGeometry(p.s[0] / 16, p.s[1] / 16), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, fog: false }));
      eyes.position.set(0, 0, p.s[2] / 32 + 0.002);
      mesh.add(eyes);
    }
    root.add(pivot);
    parts[p.n] = pivot;
    pivot.userData.mesh = mesh;
  }
  root.scale.setScalar(scale);
  return { root, parts, mats };
}

// Simple block cube mesh for item drops / falling blocks / held items
export function setTint(mats, r, g, b) {
  for (const m of mats) m.color.setRGB(r, g, b);
}
