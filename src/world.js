// Chunk storage, lighting, meshing, fluids and random ticks.
import * as THREE from '../lib/three.module.min.js';
import { BLOCKS, B, BLOCK_LIMIT } from './registry.js';
import { Generator, CS, CH, SEA, idx, biomeColors } from './worldgen.js';
import { atlasCanvas, tileUV, hex } from './textures.js';
import { mulberry32 } from './noise.js';
import { shapeBoxes, rotateBox, blockBoxesAt } from './shapes.js';
import { chunkShaders } from './shaders.js';

export { CS, CH, SEA };
const PW = CS + 2; // padded width

// ---------------------------------------------------------------- shared material
const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.flipY = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;

export const worldUniforms = {
  map: { value: atlasTex },
  daylight: { value: 1 },
  ambient: { value: 0.0 },
  fogColor: { value: new THREE.Color(0x9fc6ff) },
  fogNear: { value: 40 },
  fogFar: { value: 90 },
  time: { value: 0 },
  shaderOn: { value: 0 },
  shadowMap: { value: null },
  shadowMatrix: { value: new THREE.Matrix4() },
  shadowStrength: { value: 1 },
  sunDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() },
  sunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  skyColor: { value: new THREE.Color(0x78a7ff) },
  cameraPos: { value: new THREE.Vector3() },
  rain: { value: 0 },
  hasSky: { value: 1 },
};
const opq = chunkShaders(0.5, false), trn = chunkShaders(0.01, true);
export const opaqueMaterial = new THREE.ShaderMaterial({ uniforms: worldUniforms, vertexShader: opq.vert, fragmentShader: opq.frag });
export const translucentMaterial = new THREE.ShaderMaterial({ uniforms: worldUniforms, vertexShader: trn.vert, fragmentShader: trn.frag, transparent: true, depthWrite: false, side: THREE.DoubleSide });

// ---------------------------------------------------------------- block flags tables (fast lookup)
const OPAQUE = new Uint8Array(BLOCK_LIMIT), SOLID = new Uint8Array(BLOCK_LIMIT), EMIT = new Uint8Array(BLOCK_LIMIT), ATTEN = new Uint8Array(BLOCK_LIMIT);
for (const b of BLOCKS) {
  OPAQUE[b.id] = b.opaque ? 1 : 0;
  SOLID[b.id] = b.solid ? 1 : 0;
  EMIT[b.id] = b.light;
  ATTEN[b.id] = b.opaque ? 15 : (b.name === 'water' || b.name.endsWith('_leaves') || b.name === 'ice' || b.name === 'cobweb') ? 2 : b.name === 'lava' ? 15 : 1;
}
ATTEN[B.lava] = 15;
export { OPAQUE, SOLID };

const FACES = [
  // dir, normal, corners (unit cube), uv corner order, face shade
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.6, side: 'side' },   // +x east
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.6, side: 'side' },  // -x west
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0, side: 'top' },    // +y
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.5, side: 'bottom' }, // -y
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.8, side: 'side' },   // +z south
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.8, side: 'side' },  // -z north
];
// facing meta -> face index of the front: 0 south(+z) 1 west(-x) 2 north(-z) 3 east(+x)
const FRONT_FACE = [4, 1, 5, 0];
const AO_CURVE = [0.45, 0.62, 0.8, 1.0];
let UVROT = 0;
const wireTint = [1, 0, 0];

// facing6 meta -> face index of the front (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z)
const FRONT6 = [3, 2, 5, 4, 1, 0];
const OPP = [1, 0, 3, 2, 5, 4];
function texFor(b, faceIdx, meta) {
  const t = b.tex;
  if (typeof t === 'string') return t;
  if (b.facing6) {
    const front = FRONT6[meta & 7];
    if (faceIdx === front) return t.front;
    if (faceIdx === OPP[front]) return t.back ?? t.bottom;
    return t.side;
  }
  const f = FACES[faceIdx];
  if (f.side === 'top') return t.top;
  if (f.side === 'bottom') return t.bottom;
  if (b.orient && FRONT_FACE[meta & 3] === faceIdx) return t.front;
  return t.side;
}

// ---------------------------------------------------------------- Chunk
class Chunk {
  constructor(cx, cz, data, biomes, meta) {
    this.cx = cx; this.cz = cz;
    this.data = data; this.biomes = biomes;
    this.meta = meta ?? new Uint8Array(CS * CS * CH);
    this.light = new Uint8Array(CS * CS * CH); // sky<<4 | block
    this.lightDirty = true;
    this.meshDirty = true;
    this.meshes = [];
    this.modified = false;
  }
}

export class World {
  constructor(game, dim, seed, saved) {
    this.game = game;
    this.dim = dim;
    this.seed = seed;
    this.gen = new Generator(seed + (dim === 'nether' ? 1000 : dim === 'end' ? 2000 : 0), dim);
    this.chunks = new Map();
    this.saved = saved ?? {}; // key -> {d, m} RLE strings
    this.tiles = new Map();   // "x,y,z" -> tile entity
    this.group = new THREE.Group();
    this.fluidQueue = new Map();
    this.tickCount = 0;
    this.rng = mulberry32(seed ^ 0xabcdef);
    this.hasSky = dim === 'overworld';
    this.listeners = [];
    this.spawners = new Set();
  }
  key(cx, cz) { return cx + ',' + cz; }
  getChunk(cx, cz) { return this.chunks.get(cx + ',' + cz); }

  ensureChunk(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    const g = this.gen.generate(cx, cz);
    let meta = g.meta ?? null;
    const sv = this.saved[k];
    if (sv) { g.data.set(rleDecode(sv.d, g.data.length)); meta = rleDecode(sv.m, g.data.length, Uint8Array); }
    c = new Chunk(cx, cz, g.data, g.biomes, meta);
    if (sv) c.modified = true;
    this.chunks.set(k, c);
    this.game?.redstone?.scanChunk(c, CS);
    for (let i = 0; i < g.data.length; i++) if (g.data[i] === B.spawner) this.spawners.add(`${(i & 15) + cx * CS},${i >> 8},${((i >> 4) & 15) + cz * CS}`);
    // neighbours need relight/remesh for borders
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.getChunk(cx + dx, cz + dz);
      if (n) { n.lightDirty = true; n.meshDirty = true; }
    }
    // schedule fluid checks for saved chunks is unnecessary; generated fluids are static
    return c;
  }

  unloadChunk(c) {
    if (c.modified) this.saved[this.key(c.cx, c.cz)] = { d: rleEncode(c.data), m: rleEncode(c.meta) };
    for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.chunks.delete(this.key(c.cx, c.cz));
  }

  serialize() {
    for (const c of this.chunks.values()) if (c.modified) this.saved[this.key(c.cx, c.cz)] = { d: rleEncode(c.data), m: rleEncode(c.meta) };
    const tiles = {};
    for (const [k, v] of this.tiles) tiles[k] = v;
    return { chunks: this.saved, tiles };
  }

  // ---- block access
  getBlock(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!c) return 0;
    return c.data[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!c) return 0;
    return c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }
  isLoaded(x, z) { return this.chunks.has((x >> 4) + ',' + (z >> 4)); }
  getLight(x, y, z) {
    if (y >= CH) return 15 << 4;
    if (y < 0) return 0;
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!c) return 15 << 4;
    return c.light[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }
  biomeAt(x, z) {
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    return c ? c.biomes[(x & 15) | ((z & 15) << 4)] : 2;
  }

  setBlock(x, y, z, id, meta = 0, opts = {}) {
    if (y < 0 || y >= CH) return false;
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!c) return false;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    const old = c.data[i];
    c.data[i] = id; c.meta[i] = meta;
    c.modified = true;
    c.lightDirty = true; c.meshDirty = true;
    const lx = x & 15, lz = z & 15;
    // relight/remesh neighbours (light can travel 15 blocks so mark all 8 neighbours)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (!n) continue;
      n.lightDirty = true;
      if ((dx === -1 && lx === 0) || (dx === 1 && lx === 15) || (dz === -1 && lz === 0) || (dz === 1 && lz === 15) || EMIT[id] || EMIT[old] || OPAQUE[id] !== OPAQUE[old]) n.meshDirty = true;
    }
    if (old !== id) {
      const k = x + ',' + y + ',' + z;
      if (this.tiles.has(k) && !opts.keepTile) {
        const te = this.tiles.get(k);
        this.tiles.delete(k);
        if (te.items && this.game?.dropTileItems) this.game.dropTileItems(x, y, z, te.items);
      }
    }
    if (!opts.redstone && this.game?.redstone) this.game.redstone.onBlockChanged(x, y, z, old, id);
    if (!opts.noUpdate) this.neighborUpdate(x, y, z);
    return true;
  }

  neighborUpdate(x, y, z) {
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const id = this.getBlock(nx, ny, nz);
      if (id === B.water || id === B.lava) this.scheduleFluid(nx, ny, nz, id === B.water ? 5 : (this.dim === 'nether' ? 10 : 30));
      const b = BLOCKS[id];
      if (b.gravity) { const below = this.getBlock(nx, ny - 1, nz); if (!SOLID[below] && below !== B.water && below !== B.lava || BLOCKS[below].replaceable && below !== B.water && below !== B.lava) this.game?.spawnFallingBlock(nx, ny, nz, id); }
      // plants need support
      if ((b.render === 'cross' || b.shape === 'torch' || b.shape === 'rail' || b.shape === 'wire' || b.shape === 'plate' || id === B.repeater || id === B.powered_repeater || id === B.comparator || id === B.snow || id === B.ladder) && id !== B.cobweb && id !== B.fire) {
        const below = this.getBlock(nx, ny - 1, nz);
        let ok = SOLID[below] || below === B.farmland || below === B.farmland_wet;
        if (b.shape === 'torch' && this.getMeta(nx, ny, nz)) {
          const m = this.getMeta(nx, ny, nz);
          const [ax, az] = [[0, 1], [-1, 0], [0, -1], [1, 0]][m - 1];
          ok = SOLID[this.getBlock(nx + ax, ny, nz + az)];
        }
        if (id === B.sugar_cane) ok = below === B.sugar_cane || below === B.grass_block || below === B.dirt || below === B.sand;
        if (id === B.ladder) ok = true;
        if (!ok) { this.setBlock(nx, ny, nz, 0, 0, { noUpdate: true }); this.game?.dropBlockItems(nx, ny, nz, id); }
      }
      if (b.shape === 'door' || b.shape === 'bed') {
        const m = this.getMeta(nx, ny, nz);
        let ox = 0, oy = 0, oz = 0;
        if (b.shape === 'door') oy = m & 4 ? -1 : 1;
        else { const d = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]][m & 3]; const s = m & 4 ? -1 : 1; ox = d[0] * s; oz = d[2] * s; }
        if (this.getBlock(nx + ox, ny + oy, nz + oz) !== id) {
          this.setBlock(nx, ny, nz, 0, 0, { noUpdate: true });
          this.neighborUpdate(nx, ny, nz);
          continue;
        }
      }
      if (id === B.cactus) {
        const below = this.getBlock(nx, ny - 1, nz);
        if (below !== B.cactus && below !== B.sand && below !== B.red_sand) { this.setBlock(nx, ny, nz, 0, 0, { noUpdate: true }); this.game?.dropBlockItems(nx, ny, nz, id); }
      }
      if (id === B.nether_portal) this.game?.checkPortalIntegrity(nx, ny, nz);
    }
  }

  // ---------------------------------------------------------------- fluids
  scheduleFluid(x, y, z, delay) {
    const k = x + ',' + y + ',' + z;
    if (!this.fluidQueue.has(k)) this.fluidQueue.set(k, { x, y, z, t: this.tickCount + delay });
  }
  tickFluids() {
    if (!this.fluidQueue.size) return;
    const due = [];
    for (const [k, f] of this.fluidQueue) if (f.t <= this.tickCount) { due.push(f); this.fluidQueue.delete(k); if (due.length > 200) break; }
    for (const f of due) this.updateFluid(f.x, f.y, f.z);
  }
  updateFluid(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id !== B.water && id !== B.lava) return;
    const water = id === B.water;
    const maxSpread = water ? 7 : (this.dim === 'nether' ? 7 : 3);
    const delay = water ? 5 : (this.dim === 'nether' ? 10 : 30);
    let level = this.getMeta(x, y, z); // 0 source, 1..7 flowing, 8 falling
    const other = water ? B.lava : B.water;
    // interaction
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      if (this.getBlock(x + dx, y + dy, z + dz) === other) {
        if (!water) { this.setBlock(x, y, z, level === 0 ? B.obsidian : B.cobblestone); this.game?.sfx('fizz', x, y, z); return; }
      }
    }
    if (level !== 0) {
      // validate support
      let support = 99;
      const above = this.getBlock(x, y + 1, z);
      if (above === id) support = 0;
      else for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.getBlock(x + dx, y, z + dz) === id) {
          const m = this.getMeta(x + dx, y, z + dz);
          if (m === 8) support = Math.min(support, 0); else support = Math.min(support, m);
        }
      }
      const want = support === 0 && above === id ? 8 : support + 1;
      if (support >= maxSpread || support === 99) { this.setBlock(x, y, z, 0); return; }
      if (want !== level) { this.setBlock(x, y, z, id, want, { noUpdate: true }); level = want; this.neighborUpdate(x, y, z); }
      // infinite water source
      if (water && level !== 8) {
        let src = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.getBlock(x + dx, y, z + dz) === id && this.getMeta(x + dx, y, z + dz) === 0) src++;
        const below = this.getBlock(x, y - 1, z);
        if (src >= 2 && (SOLID[below] || (below === id && this.getMeta(x, y - 1, z) === 0))) { this.setBlock(x, y, z, id, 0); level = 0; }
      }
    }
    // flow down
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && (below === 0 || (BLOCKS[below].replaceable && below !== id && below !== other))) {
      if (below !== 0) this.game?.dropBlockItems(x, y - 1, z, below);
      this.setBlock(x, y - 1, z, id, 8);
      return;
    }
    if (below === other && water) { this.setBlock(x, y - 1, z, this.getMeta(x, y - 1, z) === 0 ? B.obsidian : B.stone); return; }
    if (below === id) return; // falling into same fluid
    const next = level === 8 ? 1 : level + 1;
    if (next > maxSpread) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const nid = this.getBlock(nx, y, nz);
      if (nid === 0 || (BLOCKS[nid].replaceable && nid !== id && nid !== other)) {
        if (nid !== 0) this.game?.dropBlockItems(nx, y, nz, nid);
        this.setBlock(nx, y, nz, id, next);
      } else if (nid === id) {
        const m = this.getMeta(nx, y, nz);
        if (m !== 0 && m !== 8 && m > next) this.setBlock(nx, y, nz, id, next);
      } else if (nid === other && water) {
        this.setBlock(nx, y, nz, this.getMeta(nx, y, nz) === 0 ? B.obsidian : B.cobblestone);
      }
    }
    void delay;
  }

  // ---------------------------------------------------------------- random ticks
  randomTick() {
    for (const c of this.chunks.values()) {
      for (let n = 0; n < 3; n++) {
        const r = (this.rng() * CS * CS * CH) | 0;
        const id = c.data[r];
        if (!id) continue;
        const x = (r & 15) + c.cx * CS, z = ((r >> 4) & 15) + c.cz * CS, y = r >> 8;
        this.tickBlock(x, y, z, id);
      }
    }
  }
  tickBlock(x, y, z, id) {
    const above = this.getBlock(x, y + 1, z);
    const light = this.getLight(x, y + 1, z);
    const lv = Math.max((light >> 4) * (this.game?.daylightLevel ?? 1), light & 15);
    if (id === B.grass_block) {
      if (OPAQUE[above]) { this.setBlock(x, y, z, B.dirt); return; }
      if (lv >= 9) for (let i = 0; i < 2; i++) {
        const nx = x + ((this.rng() * 3) | 0) - 1, ny = y + ((this.rng() * 5) | 0) - 3, nz = z + ((this.rng() * 3) | 0) - 1;
        if (this.getBlock(nx, ny, nz) === B.dirt && !OPAQUE[this.getBlock(nx, ny + 1, nz)]) this.setBlock(nx, ny, nz, B.grass_block);
      }
    } else if (id >= B.nether_wart_0 && id < B.nether_wart_3) {
      if (this.getBlock(x, y - 1, z) === B.soul_sand && this.rng() < 0.15) this.setBlock(x, y, z, id + 1);
    } else if (id >= B.wheat_0 && id <= B.potatoes_7) {
      const stage = (id - B.wheat_0) % 8;
      const below = this.getBlock(x, y - 1, z);
      if (stage < 7 && lv >= 9 && this.rng() < (below === B.farmland_wet ? 0.5 : 0.25)) this.setBlock(x, y, z, id + 1);
    } else if (id === B.farmland || id === B.farmland_wet) {
      let wet = false;
      for (let dx = -4; dx <= 4 && !wet; dx++) for (let dz = -4; dz <= 4 && !wet; dz++) for (let dy = 0; dy <= 1; dy++) if (this.getBlock(x + dx, y + dy, z + dz) === B.water) { wet = true; break; }
      if (wet && id === B.farmland) this.setBlock(x, y, z, B.farmland_wet);
      else if (!wet && id === B.farmland_wet) this.setBlock(x, y, z, B.farmland);
      else if (!wet && !(above >= B.wheat_0 && above <= B.potatoes_7) && this.rng() < 0.2) this.setBlock(x, y, z, B.dirt);
      if (OPAQUE[above]) this.setBlock(x, y, z, B.dirt);
    } else if (id === B.oak_sapling || id === B.spruce_sapling || id === B.birch_sapling) {
      if (lv >= 9 && this.rng() < 0.15) this.growTree(x, y, z, id);
    } else if (id === B.sugar_cane || id === B.cactus) {
      if (above === 0) {
        let h = 1; while (this.getBlock(x, y - h, z) === id) h++;
        if (h < 3 && this.rng() < 0.3) this.setBlock(x, y + 1, z, id);
      }
    } else if (id === B.fire) {
      const below = this.getBlock(x, y - 1, z);
      if (below === B.netherrack || below === B.magma_block) return;
      if (this.rng() < 0.3) { this.setBlock(x, y, z, 0); return; }
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nid = this.getBlock(x + dx, y + dy, z + dz);
        if (BLOCKS[nid].flammable && this.rng() < 0.3) {
          this.setBlock(x + dx, y + dy, z + dz, 0);
          if (this.getBlock(x + dx, y + dy, z + dz) === 0) this.setBlock(x + dx, y + dy, z + dz, B.fire);
        }
      }
    } else if (id === B.ice) {
      if ((light & 15) > 11) this.setBlock(x, y, z, B.water);
    } else if (id === B.snow) {
      if ((light & 15) > 11) this.setBlock(x, y, z, 0);
    }
  }

  growTree(x, y, z, sapling) {
    const kind = sapling === B.spruce_sapling ? 'spruce' : sapling === B.birch_sapling ? 'birch' : 'oak';
    this.setBlock(x, y, z, 0, 0, { noUpdate: true });
    const rng = mulberry32((x * 31 + z * 17 + y) >>> 0);
    this.gen.tree(kind, x, y, z, rng, (wx, wy, wz, id, force) => {
      const cur = this.getBlock(wx, wy, wz);
      if (force || cur === 0 || BLOCKS[cur].replaceable || BLOCKS[cur].name.endsWith('_leaves')) this.setBlock(wx, wy, wz, id, 0, { noUpdate: true });
    });
  }

  tick() {
    this.tickCount++;
    this.tickFluids();
    this.randomTick();
  }

  // ---------------------------------------------------------------- lighting
  computeLight(c) {
    const L = c.light;
    L.fill(0);
    const D = c.data;
    const q = [];
    // sky light columns
    if (this.hasSky) {
      for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
        let lvl = 15;
        for (let y = CH - 1; y >= 0; y--) {
          const i = x | (z << 4) | (y << 8);
          const id = D[i];
          if (id) { const a = ATTEN[id]; if (a >= 15) break; if (a > 1) lvl = Math.max(0, lvl - a); }
          L[i] = lvl << 4;
          if (lvl > 1) q.push(i);
          if (lvl === 0) break;
        }
      }
    }
    // seeds from neighbour borders
    const seedFrom = (n, dx, dz) => {
      if (!n || n.lightDirty) return;
      for (let y = 0; y < CH; y++) for (let k = 0; k < CS; k++) {
        let sx, sz, tx, tz;
        if (dx === 1) { sx = 0; sz = k; tx = 15; tz = k; }
        else if (dx === -1) { sx = 15; sz = k; tx = 0; tz = k; }
        else if (dz === 1) { sx = k; sz = 0; tx = k; tz = 15; }
        else { sx = k; sz = 15; tx = k; tz = 0; }
        const nl = n.light[sx | (sz << 4) | (y << 8)];
        const ti = tx | (tz << 4) | (y << 8);
        if (OPAQUE[D[ti]]) continue;
        const a = ATTEN[D[ti]] || 1;
        const s = Math.max(0, (nl >> 4) - a), b = Math.max(0, (nl & 15) - a);
        const cur = L[ti];
        const ns = Math.max(cur >> 4, s), nb = Math.max(cur & 15, b);
        if (ns !== cur >> 4 || nb !== (cur & 15)) { L[ti] = (ns << 4) | nb; q.push(ti); }
      }
    };
    seedFrom(this.getChunk(c.cx + 1, c.cz), 1, 0);
    seedFrom(this.getChunk(c.cx - 1, c.cz), -1, 0);
    seedFrom(this.getChunk(c.cx, c.cz + 1), 0, 1);
    seedFrom(this.getChunk(c.cx, c.cz - 1), 0, -1);
    // emitters
    for (let i = 0; i < D.length; i++) {
      const e = EMIT[D[i]];
      if (e) {
        const lvl = D[i] === B.lava && this.getMetaLocal(c, i) !== 0 ? e - 1 : e;
        if ((L[i] & 15) < lvl) { L[i] = (L[i] & 0xf0) | lvl; q.push(i); }
      }
    }
    // BFS
    let head = 0;
    while (head < q.length) {
      const i = q[head++];
      const l = L[i];
      const s = l >> 4, b = l & 15;
      if (s <= 1 && b <= 1) continue;
      const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
      for (let f = 0; f < 6; f++) {
        let j;
        if (f === 0) { if (x === 15) continue; j = i + 1; }
        else if (f === 1) { if (x === 0) continue; j = i - 1; }
        else if (f === 2) { if (z === 15) continue; j = i + 16; }
        else if (f === 3) { if (z === 0) continue; j = i - 16; }
        else if (f === 4) { if (y === CH - 1) continue; j = i + 256; }
        else { if (y === 0) continue; j = i - 256; }
        const id = D[j];
        const a = ATTEN[id];
        if (a >= 15) continue;
        const cl = L[j];
        const ns = s - a, nb = b - a;
        const cs = cl >> 4, cb = cl & 15;
        if (ns > cs || nb > cb) {
          L[j] = (Math.max(ns, cs) << 4) | Math.max(nb, cb, 0);
          q.push(j);
        }
      }
    }
    c.lightDirty = false;
  }
  getMetaLocal(c, i) { return c.meta[i]; }

  // ---------------------------------------------------------------- meshing
  buildMesh(c) {
    // padded copies
    const P = new Uint16Array(PW * PW * CH), PL = new Uint8Array(PW * PW * CH), PM = new Uint8Array(PW * PW * CH);
    const pidx = (x, y, z) => (x + 1) + (z + 1) * PW + y * PW * PW;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = (dx || dz) ? this.getChunk(c.cx + dx, c.cz + dz) : c;
      const x0 = dx === -1 ? 15 : 0, x1 = dx === 1 ? 0 : 15;
      const z0 = dz === -1 ? 15 : 0, z1 = dz === 1 ? 0 : 15;
      for (let y = 0; y < CH; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const pi = pidx(x + dx * 16, y, z + dz * 16);
        if (!n) { P[pi] = 0; PL[pi] = 15 << 4; continue; }
        const i = x | (z << 4) | (y << 8);
        P[pi] = n.data[i]; PL[pi] = n.light[i]; PM[pi] = n.meta[i];
      }
    }
    const bufs = { opaque: newBuf(), translucent: newBuf() };
    const biomeTint = {};
    const tintFor = (kind, x, z) => {
      const bi = c.biomes[(x & 15) | ((z & 15) << 4)];
      const bc = biomeColors(bi);
      if (kind === 'water') return hexRGB(bc.water);
      if (kind === 'grass' || kind === 'grass_top') return hexRGB(bc.grass);
      if (kind === 'foliage_spruce') return [0.38, 0.6, 0.38];
      if (kind === 'foliage_birch') return [0.5, 0.65, 0.33];
      if (kind && kind.startsWith('foliage')) return hexRGB(bc.foliage);
      return [1, 1, 1];
    };
    void biomeTint;
    const getP = (x, y, z) => (y < 0 ? B.bedrock : y >= CH ? 0 : P[pidx(x, y, z)]);
    const getL = (x, y, z) => (y < 0 ? 0 : y >= CH ? 0xf0 : PL[pidx(x, y, z)]);

    for (let y = 0; y < CH; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const id = P[pidx(x, y, z)];
      if (!id) continue;
      const b = BLOCKS[id];
      const meta = PM[pidx(x, y, z)];
      const buf = b.pass === 'translucent' ? bufs.translucent : bufs.opaque;
      if (b.render === 'cube') {
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
          const nid = getP(nx, ny, nz);
          if (OPAQUE[nid]) continue;
          if (nid === id && !b.opaque && !(this.game?.options?.fancy && b.tint?.startsWith('foliage'))) continue; // glass/ice (and leaves on "fast" graphics)
          const tex = texFor(b, f, meta);
          const tint = b.tint && (b.tint !== 'grass_top' || F.side === 'top') ? tintFor(b.tint, x, z) : null;
          emitFace(buf, F, x, y, z, tex, tint, getP, getL, [0, 0, 0, 1, 1, 1], false, false, b.tint?.startsWith('foliage') ? 1 : 0);
        }
      } else if (b.render === 'liquid') {
        const above = getP(x, y + 1, z);
        const h = above === id ? 1 : meta === 0 || meta === 8 ? 0.875 : Math.max(0.12, (8 - meta) / 9);
        const tint = b.tint ? tintFor(b.tint, x, z) : null;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nid = getP(x + F.n[0], y + F.n[1], z + F.n[2]);
          if (nid === id) continue;
          if (OPAQUE[nid] && f !== 2) continue;
          if (f === 2 && OPAQUE[nid]) continue;
          emitFace(buf, F, x, y, z, b.tex, tint, getP, getL, [0, 0, 0, 1, h, 1], true, false, b.anim === 1 ? 3 : 4);
        }
      } else if (b.render === 'cross') {
        const tex = id >= B.wheat_0 && id <= B.potatoes_7 ? b.name : b.tex;
        const tint = b.tint ? tintFor(b.tint, x, z) : null;
        emitCross(buf, x, y, z, tex, tint, getL(x, y, z), id === B.fire || id === B.cobweb ? 0 : 2);
      } else if (b.render === 'box' || b.render === 'portal') {
        let boxes;
        if (b.render === 'portal') boxes = [meta & 1 ? [0.375, 0, 0, 0.625, 1, 1] : [0, 0, 0.375, 1, 1, 0.625]];
        else {
          boxes = shapeBoxes(b, meta, (dx, dy, dz) => getP(x + dx, y + dy, z + dz));
          if (b.orient && b.box && !b.shape) boxes = boxes.map((bx) => rotateBox(bx, meta & 3));
        }
        const tint = b.tint ? tintFor(b.tint, x, z) : null;
        for (const box of boxes) for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const atEdge = (F.n[0] === 1 && box[3] === 1) || (F.n[0] === -1 && box[0] === 0) || (F.n[1] === 1 && box[4] === 1) || (F.n[1] === -1 && box[1] === 0) || (F.n[2] === 1 && box[5] === 1) || (F.n[2] === -1 && box[2] === 0);
          if (atEdge) {
            const nid = getP(x + F.n[0], y + F.n[1], z + F.n[2]);
            if (OPAQUE[nid] || (nid === id && (b.render === 'portal' || b.shape === 'pane'))) continue;
          }
          let tex = texFor(b, f, meta);
          if (b.shape === 'door') tex = b.name === 'iron_door' ? (meta & 4 ? 'iron_door_top' : 'iron_door_bottom') : (meta & 4 ? 'door_top' : 'door_bottom');
          if (b.shape === 'rail') { const rm = b.name === 'rail' ? meta : meta & 7; if (rm >= 6) { tex = 'rail_corner'; UVROT = [3, 0, 1, 2][rm - 6]; } else UVROT = rm === 1 || rm === 2 || rm === 3 ? 1 : 0; }
          if (b.shape === 'wire') { const p = meta & 15; wireTint[0] = 0.32 + 0.68 * p / 15; wireTint[1] = 0.02 + 0.1 * (p / 15) ** 3; wireTint[2] = 0.02; }
          if (b.shape !== 'rail') UVROT = b.topRot && F.side === 'top' ? meta & 3 : 0;
          else if (F.side !== 'top') UVROT = 0;
          if (b.shape === 'bed' && F.side === 'top') tex = meta & 4 ? 'bed_top' : 'bed_foot';
          emitFace(buf, F, x, y, z, tex, b.shape === 'wire' ? wireTint : tint, getP, getL, box, !!b.shape && b.shape !== 'slab' && b.shape !== 'stairs' ? true : b.shape ? false : true, b.render === 'portal', b.render === 'portal' ? 5 : 0);
          UVROT = 0;
        }
      }
    }
    // replace meshes
    for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
    c.meshes = [];
    for (const [k, buf] of Object.entries(bufs)) {
      if (!buf.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      g.setAttribute('light', new THREE.Float32BufferAttribute(buf.light, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nrm, 3));
      g.setAttribute('mat', new THREE.Float32BufferAttribute(buf.mat, 1));
      g.setIndex(buf.ind);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, k === 'opaque' ? opaqueMaterial : translucentMaterial);
      mesh.position.set(c.cx * CS, 0, c.cz * CS);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (k === 'translucent') mesh.renderOrder = 1;
      this.group.add(mesh);
      c.meshes.push(mesh);
    }
    c.meshDirty = false;
  }

  // Update loop for lighting / meshing with a time budget
  processDirty(px, pz, budgetMs = 6) {
    const t0 = performance.now();
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const list = [...this.chunks.values()].filter((c) => c.lightDirty || c.meshDirty);
    list.sort((a, b) => (Math.abs(a.cx - pcx) + Math.abs(a.cz - pcz)) - (Math.abs(b.cx - pcx) + Math.abs(b.cz - pcz)));
    for (const c of list) {
      if (performance.now() - t0 > budgetMs) break;
      // only mesh when all 4 neighbours exist (so borders are right) or at the edge of view
      if (c.lightDirty) this.computeLight(c);
    }
    for (const c of list) {
      if (performance.now() - t0 > budgetMs * 2) break;
      if (!c.lightDirty && c.meshDirty) {
        const ready = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => { const n = this.getChunk(c.cx + dx, c.cz + dz); return !n || !n.lightDirty; });
        if (ready) this.buildMesh(c);
      }
    }
  }

  // ---- raycast (DDA)
  raycast(origin, dir, maxDist, fluids = false) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = Math.abs(1 / dir.x), tDeltaY = Math.abs(1 / dir.y), tDeltaZ = Math.abs(1 / dir.z);
    let tMaxX = dir.x > 0 ? (x + 1 - origin.x) * tDeltaX : (origin.x - x) * tDeltaX;
    let tMaxY = dir.y > 0 ? (y + 1 - origin.y) * tDeltaY : (origin.y - y) * tDeltaY;
    let tMaxZ = dir.z > 0 ? (z + 1 - origin.z) * tDeltaZ : (origin.z - z) * tDeltaZ;
    let face = [0, 0, 0], t = 0;
    for (let i = 0; i < 200 && t <= maxDist; i++) {
      const id = this.getBlock(x, y, z);
      if (id) {
        const b = BLOCKS[id];
        const isFluid = b.render === 'liquid';
        if ((!isFluid || fluids) && b.render !== 'none') {
          // box-shaped blocks: test the actual box
          if ((b.box || b.shape) && b.render !== 'cross') {
            let best = null;
            for (const bx of blockBoxesAt(this, b, x, y, z)) {
              const hit = rayBox(origin, dir, bx);
              if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) best = hit;
            }
            if (best) return { x, y, z, id, face: best.n, dist: best.t };
          } else return { x, y, z, id, face, dist: t };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0]; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0]; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ]; }
    }
    return null;
  }

  // highest non-air block at x,z
  surfaceY(x, z) {
    for (let y = CH - 1; y > 0; y--) { const id = this.getBlock(x, y, z); if (id && SOLID[id]) return y; }
    return -1;
  }

  dispose() {
    for (const c of this.chunks.values()) for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
  }
}

// ---------------------------------------------------------------- mesh helpers
function newBuf() { return { pos: [], uv: [], light: [], col: [], nrm: [], mat: [], ind: [], n: 0 }; }
function hexRGB(c) { const h = hex(c); return [h[0] / 255, h[1] / 255, h[2] / 255]; }

export { rotateBox };

function rayBox(o, d, bx) {
  let tmin = -Infinity, tmax = Infinity, n = [0, 0, 0];
  const axes = ['x', 'y', 'z'];
  for (let a = 0; a < 3; a++) {
    const oa = o[axes[a]], da = d[axes[a]];
    const lo = bx[a], hi = bx[a + 3];
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return null; continue; }
    let t1 = (lo - oa) / da, t2 = (hi - oa) / da;
    let nn = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; nn = 1; }
    if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[a] = nn; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), n };
}

function emitFace(buf, F, x, y, z, tex, tint, getP, getL, box, noAO = false, flat = false, mat = 0) {
  const [u0, v0, us] = tileUV(tex);
  const [x0, y0, z0, x1, y1, z1] = box;
  const n = F.n;
  const base = buf.pos.length / 3;
  const ao = [];
  const lights = [];
  // light from the cell in front of the face (or own cell when inset)
  const inset = (n[0] === 1 && x1 < 1) || (n[0] === -1 && x0 > 0) || (n[1] === 1 && y1 < 1) || (n[1] === -1 && y0 > 0) || (n[2] === 1 && z1 < 1) || (n[2] === -1 && z0 > 0);
  const fx = inset ? x : x + n[0], fy = inset ? y : y + n[1], fz = inset ? z : z + n[2];
  const lc = getL(fx, fy, fz);
  for (let k = 0; k < 4; k++) {
    const c = F.c[k];
    const px = x + (c[0] ? x1 : x0), py = y + (c[1] ? y1 : y0), pz = z + (c[2] ? z1 : z0);
    buf.pos.push(px, py, pz);
    // uv: project onto face plane
    let su, sv;
    if (n[0] !== 0) { su = n[0] > 0 ? 1 - (c[2] ? z1 : z0) : (c[2] ? z1 : z0); sv = 1 - (c[1] ? y1 : y0); }
    else if (n[1] !== 0) { su = c[0] ? x1 : x0; sv = n[1] > 0 ? (c[2] ? z1 : z0) : 1 - (c[2] ? z1 : z0); }
    else { su = n[2] > 0 ? (c[0] ? x1 : x0) : 1 - (c[0] ? x1 : x0); sv = 1 - (c[1] ? y1 : y0); }
    if (UVROT) { for (let r = 0; r < UVROT; r++) { const t = su; su = 1 - sv; sv = t; } }
    const eps = 0.0005;
    buf.uv.push(u0 + (eps + su * (1 - 2 * eps)) * us, v0 + (eps + sv * (1 - 2 * eps)) * us);
    // AO + smooth light
    let aoV = 3, ls = lc >> 4, lb = lc & 15, cnt = 1;
    if (!noAO && !flat) {
      const d1 = [0, 0, 0], d2 = [0, 0, 0];
      // tangent directions toward this corner
      const axes = [0, 1, 2].filter((a) => n[a] === 0);
      d1[axes[0]] = c[axes[0]] ? 1 : -1;
      d2[axes[1]] = c[axes[1]] ? 1 : -1;
      const s1x = fx + d1[0], s1y = fy + d1[1], s1z = fz + d1[2];
      const s2x = fx + d2[0], s2y = fy + d2[1], s2z = fz + d2[2];
      const cxx = fx + d1[0] + d2[0], cyy = fy + d1[1] + d2[1], czz = fz + d1[2] + d2[2];
      const o1 = OPAQUE[getP(s1x, s1y, s1z)], o2 = OPAQUE[getP(s2x, s2y, s2z)], oc = OPAQUE[getP(cxx, cyy, czz)];
      aoV = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
      if (!o1) { const l = getL(s1x, s1y, s1z); ls += l >> 4; lb += l & 15; cnt++; }
      if (!o2) { const l = getL(s2x, s2y, s2z); ls += l >> 4; lb += l & 15; cnt++; }
      if (!oc && !(o1 && o2)) { const l = getL(cxx, cyy, czz); ls += l >> 4; lb += l & 15; cnt++; }
    }
    ao.push(aoV);
    lights.push(ls / cnt / 15, lb / cnt / 15);
    const shadeF = (flat ? 1 : F.s) * AO_CURVE[aoV];
    const t = tint ?? [1, 1, 1];
    buf.col.push(t[0] * shadeF, t[1] * shadeF, t[2] * shadeF);
  }
  buf.light.push(...lights);
  for (let k = 0; k < 4; k++) { buf.nrm.push(n[0], n[1], n[2]); buf.mat.push(mat); }
  // flip quad diagonal for nicer AO interpolation
  if (ao[0] + ao[2] < ao[1] + ao[3]) buf.ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else buf.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function emitCross(buf, x, y, z, tex, tint, l, mat = 2) {
  const [u0, v0, us] = tileUV(tex);
  const t = tint ?? [1, 1, 1];
  const quads = [
    [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 1, 0.85], [0.15, 1, 0.15]],
    [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.15, 1, 0.85], [0.85, 1, 0.15]],
  ];
  const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
  for (const q of quads) for (const flip of [false, true]) {
    const base = buf.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      const p = q[k];
      buf.pos.push(x + p[0], y + p[1], z + p[2]);
      buf.uv.push(u0 + (0.001 + uvs[k][0] * 0.998) * us, v0 + (0.001 + uvs[k][1] * 0.998) * us);
      buf.light.push((l >> 4) / 15, (l & 15) / 15);
      buf.col.push(t[0] * 0.9, t[1] * 0.9, t[2] * 0.9);
      buf.nrm.push(0, 1, 0);
      buf.mat.push(mat * (uvs[k][1] === 0 ? 1 : 0.001)); // only the top vertices sway
    }
    if (flip) buf.ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else buf.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// ---------------------------------------------------------------- RLE (for saves)
// Format "2:" = 16-bit values (block ids up to 1023). Older saves are 8-bit without prefix.
export function rleEncode(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i]; let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 65535) n++;
    out.push(v & 255, v >> 8, n & 255, n >> 8);
    i += n;
  }
  let s = '';
  const u = new Uint8Array(out);
  for (let k = 0; k < u.length; k += 8192) s += String.fromCharCode.apply(null, u.subarray(k, k + 8192));
  return '2:' + btoa(s);
}
export function rleDecode(str, len, Arr = Uint16Array) {
  const out = new Arr(len);
  let o = 0;
  if (str.startsWith('2:')) {
    const bin = atob(str.slice(2));
    for (let i = 0; i < bin.length; i += 4) {
      const v = bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8), n = bin.charCodeAt(i + 2) | (bin.charCodeAt(i + 3) << 8);
      out.fill(v, o, o + n); o += n;
    }
    return out;
  }
  const bin = atob(str);
  for (let i = 0; i < bin.length; i += 3) {
    const v = bin.charCodeAt(i), n = bin.charCodeAt(i + 1) | (bin.charCodeAt(i + 2) << 8);
    out.fill(v, o, o + n); o += n;
  }
  return out;
}
