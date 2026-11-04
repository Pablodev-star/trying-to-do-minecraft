// Terrain generators for the Overworld, Nether and End.
import { Simplex, hash3, mulberry32 } from './noise.js';
import { B, BLOCKS } from './registry.js';
const BLOCKS_REPLACE = new Set();
queueMicrotask(() => { for (const b of BLOCKS) if (b.replaceable || b.render === 'cross') BLOCKS_REPLACE.add(b.id); });

export const CS = 16;      // chunk size x/z
export const CH = 128;     // world height
export const SEA = 62;
export const idx = (x, y, z) => x | (z << 4) | (y << 8);

export const BIOMES = [
  { name: 'Océano', grass: 0x8eb971, foliage: 0x71a74d, water: 0x3f76e4 },          // 0
  { name: 'Playa', grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4 },           // 1
  { name: 'Llanura', grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4 },         // 2
  { name: 'Bosque', grass: 0x79c05a, foliage: 0x59ae30, water: 0x3f76e4 },          // 3
  { name: 'Bosque de abedules', grass: 0x88bb67, foliage: 0x6ba941, water: 0x3f76e4 }, // 4
  { name: 'Taiga', grass: 0x86b783, foliage: 0x68a464, water: 0x287082 },           // 5
  { name: 'Desierto', grass: 0xbfb755, foliage: 0xaea42a, water: 0x32a598 },        // 6
  { name: 'Llanura nevada', grass: 0x80b497, foliage: 0x60a17b, water: 0x3d57d6 },  // 7
  { name: 'Montañas', grass: 0x8ab689, foliage: 0x6da36b, water: 0x3f76e4 },        // 8
  { name: 'Jungla', grass: 0x59c93c, foliage: 0x30bb0b, water: 0x14a2c5 },          // 9
  { name: 'Sabana', grass: 0xbfb755, foliage: 0xaea42a, water: 0x2c8b9c },          // 10
  { name: 'Pantano', grass: 0x6a7039, foliage: 0x6a7039, water: 0x617b64 },         // 11
  { name: 'Páramos del Nether', grass: 0xbfb755, foliage: 0xaea42a, water: 0x3f76e4 }, // 12
  { name: 'El End', grass: 0x8eb971, foliage: 0x71a74d, water: 0x3f76e4 },          // 13
  { name: 'Bosque oscuro', grass: 0x507a32, foliage: 0x59ae30, water: 0x3f76e4 },  // 14
  { name: 'Arboleda de cerezos', grass: 0xb6db61, foliage: 0xb6db61, water: 0x5db7ef }, // 15
  { name: 'Campos de hongos', grass: 0x55c93f, foliage: 0x2bbb0f, water: 0x3f76e4 }, // 16
  { name: 'Badlands', grass: 0x90814d, foliage: 0x9e814d, water: 0x3f76e4 },       // 17
  { name: 'Manglar', grass: 0x6a7039, foliage: 0x8db127, water: 0x3a7a6a },        // 18
  { name: 'Picos de hielo', grass: 0x80b497, foliage: 0x60a17b, water: 0x3d57d6 }, // 19
  { name: 'Océano cálido', grass: 0x8eb971, foliage: 0x71a74d, water: 0x43d5ee },  // 20
  { name: 'Océano helado', grass: 0x80b497, foliage: 0x60a17b, water: 0x3938c9 },  // 21
  { name: 'Bosque carmesí', grass: 0, foliage: 0, water: 0x3f76e4 },               // 22
  { name: 'Bosque distorsionado', grass: 0, foliage: 0, water: 0x3f76e4 },         // 23
  { name: 'Valle de almas', grass: 0, foliage: 0, water: 0x3f76e4 },               // 24
  { name: 'Deltas de basalto', grass: 0, foliage: 0, water: 0x3f76e4 },            // 25
];

export class Generator {
  constructor(seed, dim) {
    this.seed = seed >>> 0;
    this.dim = dim;
    this.n1 = new Simplex(seed);
    this.n2 = new Simplex(seed + 1);
    this.n3 = new Simplex(seed + 2);
    this.n4 = new Simplex(seed + 3);
    this.n5 = new Simplex(seed + 4);
    this.cave1 = new Simplex(seed + 10);
    this.cave2 = new Simplex(seed + 11);
    this.cave3 = new Simplex(seed + 12);
    const r = mulberry32(seed + 99);
    const ang = r() * Math.PI * 2, dist = 280 + r() * 200;
    this.stronghold = { x: Math.round(Math.cos(ang) * dist), y: 28, z: Math.round(Math.sin(ang) * dist) };
  }

  // ---- overworld climate & height (pure functions of x,z)
  climate(x, z) {
    const t = this.n4.fbm2(x / 900, z / 900, 3);
    const h = this.n5.fbm2(x / 700 + 100, z / 700, 3);
    return [t, h];
  }
  heightInfo(x, z) {
    const c = this.n1.fbm2(x / 520, z / 520, 4);
    const detail = this.n2.fbm2(x / 70, z / 70, 3);
    const mtn = Math.max(0, this.n3.fbm2(x / 380, z / 380, 4) - 0.15);
    const [t, hum] = this.climate(x, z);
    let h = 64 + c * 22 + detail * 5;
    if (c < -0.2) h = 62 + (c + 0.2) * 70 + detail * 3; // oceans
    const m = mtn * mtn * 160 * Math.max(0, Math.min(1, (c + 0.1) * 3));
    h += m;
    if (hum > 0.35 && t > -0.1 && h > 61 && h < 68 && m < 4) h = 62 + (h - 62) * 0.3; // swamp flats
    h = Math.floor(Math.min(CH - 8, Math.max(8, h)));
    const variant = this.n2.fbm2(x / 900 + 300, z / 900 - 200, 2);
    // mushroom islands rise out of deep ocean
    if (c < -0.38 && variant > 0.42) { h = Math.floor(64 + (variant - 0.42) * 40 + detail * 3); return { h, biome: 16, t }; }
    // badlands plateaus with terraces
    if (t > 0.42 && hum < -0.2 && h >= SEA + 2) { const plat = Math.max(0, this.n3.fbm2(x / 160, z / 160, 3) + 0.2) * 40; h = Math.floor(Math.min(CH - 10, h + Math.floor(plat / 4) * 4)); return { h, biome: 17, t }; }
    let biome;
    if (h < SEA - 1) biome = t > 0.4 ? 20 : t < -0.4 ? 21 : 0;
    else if (h <= SEA + 1 && t > -0.45) biome = 1;
    else if (m > 18) biome = 8;
    else if (t < -0.45) biome = variant > 0.35 ? 19 : 7;
    else if (m > 5 && t > -0.15 && t < 0.25 && hum < 0.15) biome = 15;
    else if (t < -0.2) biome = 5;
    else if (t > 0.38 && hum < 0.05) biome = 6;
    else if (t > 0.3 && hum > 0.25) biome = 9;
    else if (t > 0.3) biome = 10;
    else if (hum > 0.35 && h < 66) biome = t > 0.22 ? 18 : 11;
    else if (hum > 0.3 && variant > 0.15) biome = 14;
    else if (hum > 0.1) biome = 3;
    else if (hum < -0.25) biome = 2;
    else if (hum < 0) biome = 4;
    else biome = 2;
    return { h, biome, t };
  }

  generate(cx, cz) {
    const data = new Uint16Array(CS * CS * CH);
    const biomes = new Uint8Array(CS * CS);
    if (this.dim === 'nether') this.genNether(cx, cz, data, biomes);
    else if (this.dim === 'end') this.genEnd(cx, cz, data, biomes);
    else this.genOverworld(cx, cz, data, biomes);
    let meta = null;
    if (this.pendingMeta?.length) {
      meta = new Uint8Array(CS * CS * CH);
      for (const [pcx, pcz, i, m] of this.pendingMeta) if (pcx === cx && pcz === cz) meta[i] = m;
      this.pendingMeta = [];
    }
    return { data, biomes, meta };
  }

  // ------------------------------------------------------------ overworld
  genOverworld(cx, cz, data, biomes) {
    const x0 = cx * CS, z0 = cz * CS;
    const heights = new Int16Array(256);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const { h, biome } = this.heightInfo(wx, wz);
      heights[x | (z << 4)] = h;
      biomes[x | (z << 4)] = biome;
      const r = hash3(this.seed, wx, 0, wz);
      for (let y = 0; y <= Math.max(h, SEA); y++) {
        let id = 0;
        if (y === 0 || (y < 4 && r * 4 > y)) id = B.bedrock;
        else if (y < h - 4) id = y < 12 + Math.floor(r * 4) ? B.deepslate : B.stone;
        else if (biome === 17 && y <= h) {
          // badlands: red sand on top, coloured terracotta bands below
          const bands = [B.terracotta, B.orange_terracotta, B.terracotta, B.yellow_terracotta, B.red_terracotta, B.terracotta, B.brown_terracotta, B.white_terracotta, B.light_gray_terracotta, B.terracotta];
          id = y === h ? (h > 85 ? B.terracotta : B.red_sand) : y > h - 2 && h <= 85 ? B.red_sandstone : bands[((y + Math.floor(this.n5.noise2(x / 60, z / 60) * 2)) % bands.length + bands.length) % bands.length];
        } else if (y < h) {
          if (biome === 6 || biome === 1) id = y < h - 2 ? B.sandstone : B.sand;
          else if (biome === 18) id = B.mud;
          else if (biome === 20) id = B.sand;
          else if (biome === 0) id = B.sand;
          else if (biome === 8 && h > 95) id = B.stone;
          else id = B.dirt;
        } else if (y === h) {
          if (biome === 6 || biome === 1) id = B.sand;
          else if (biome === 0) id = r < 0.3 ? B.gravel : r < 0.4 ? B.clay : B.sand;
          else if (biome === 8 && h > 100) id = h > 110 ? B.snow_block : B.stone;
          else if (biome === 7 || biome === 19) id = biome === 19 && r < 0.3 ? B.packed_ice : B.snowy_grass;
          else if (biome === 16) id = B.mycelium;
          else if (biome === 18) id = h < SEA ? B.mud : (r < 0.5 ? B.mud : B.grass_block);
          else if (biome === 20) id = r < 0.12 ? [B.tube_coral_block, B.brain_coral_block, B.fire_coral_block, B.horn_coral_block][Math.floor(r * 33) % 4] : B.sand;
          else if (biome === 21) id = B.gravel;
          else if (biome === 5 && r < 0.25) id = B.podzol;
          else id = h < SEA ? B.dirt : B.grass_block;
        } else if (y <= SEA) {
          id = ((biome === 7 || biome === 19 || biome === 21) && y === SEA) ? (biome === 21 && r < 0.1 ? B.packed_ice : B.ice) : B.water;
        }
        data[idx(x, y, z)] = id;
      }
      if ((biome === 7 || biome === 19) && h >= SEA) data[idx(x, h + 1, z)] = B.snow;
    }
    // caves
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = heights[x | (z << 4)];
      const top = Math.min(h, CH - 2);
      for (let y = 1; y <= top; y++) {
        const i = idx(x, y, z);
        const id = data[i];
        if (id === B.bedrock || id === B.water || id === 0) continue;
        if (y > h - 4 && h <= SEA + 1) continue; // don't breach sea floor/coast
        const a = this.cave1.noise3(wx / 48, y / 28, wz / 48);
        const b = this.cave2.noise3(wx / 48, y / 28, wz / 48);
        let carve = a * a + b * b < 0.007;
        if (!carve && y < 50) {
          const c = this.cave3.noise3(wx / 70, y / 30, wz / 70);
          carve = c > 0.62 - (50 - y) * 0.002;
        }
        if (carve) data[i] = y < 11 ? B.lava : 0;
      }
    }
    // ores and stone variants
    const rng = mulberry32((this.seed ^ (cx * 341873128712 + cz * 132897987541)) >>> 0);
    const vein = (id, count, size, minY, maxY, replace = B.stone) => {
      for (let i = 0; i < count; i++) {
        let x = (rng() * 16) | 0, y = minY + ((rng() * (maxY - minY)) | 0), z = (rng() * 16) | 0;
        for (let k = 0; k < size; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH && data[idx(x, y, z)] === replace) data[idx(x, y, z)] = id;
          const d = (rng() * 6) | 0;
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    vein(B.granite, 2, 30, 1, 80); vein(B.diorite, 2, 30, 1, 80); vein(B.andesite, 2, 30, 1, 80);
    vein(B.dirt, 3, 24, 1, 80); vein(B.gravel, 3, 24, 1, 80);
    vein(B.coal_ore, 18, 12, 5, 128); vein(B.iron_ore, 14, 8, 1, 64); vein(B.copper_ore, 8, 9, 20, 96);
    vein(B.gold_ore, 3, 7, 1, 32); vein(B.redstone_ore, 7, 7, 1, 16); vein(B.lapis_ore, 2, 6, 1, 32);
    vein(B.diamond_ore, 2, 6, 1, 16);
    vein(B.deepslate_diamond_ore, 2, 6, 1, 14, B.deepslate); vein(B.deepslate_iron_ore, 4, 8, 1, 14, B.deepslate);
    vein(B.deepslate_gold_ore, 2, 7, 1, 14, B.deepslate); vein(B.deepslate_redstone_ore, 4, 7, 1, 14, B.deepslate); vein(B.deepslate_lapis_ore, 1, 6, 1, 14, B.deepslate);
    if (biomes[0] === 17) vein(B.gold_ore, 6, 8, 30, 80);
    // amethyst geode
    if (rng() < 0.03) {
      const gx = 4 + ((rng() * 8) | 0), gy = 15 + ((rng() * 20) | 0), gz = 4 + ((rng() * 8) | 0);
      for (let dx = -5; dx <= 5; dx++) for (let dy = -5; dy <= 5; dy++) for (let dz = -5; dz <= 5; dz++) {
        const x = gx + dx, y = gy + dy, z = gz + dz;
        if (x < 0 || x > 15 || z < 0 || z > 15 || y < 2) continue;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > 5) continue;
        data[idx(x, y, z)] = d > 4.3 ? B.smooth_basalt : d > 3.6 ? B.calcite : d > 2.8 ? B.amethyst_block : 0;
        if (d <= 2.8 && d > 2 && rng() < 0.15) data[idx(x, y, z)] = B.amethyst_cluster;
      }
    }
    if (biomes[0] === 8) vein(B.emerald_ore, 4, 1, 4, 32);
    // features (trees etc) from this and neighbouring chunks
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.featuresOverworld(cx + dx, cz + dz, cx, cz, data);
    this.placeVillages(cx, cz, data);
    this.placeDungeon(cx, cz, data);
    this.placeStronghold(cx, cz, data);
  }

  featuresOverworld(fcx, fcz, cx, cz, data) {
    const rng = mulberry32((this.seed * 31 + fcx * 73856093 ^ fcz * 19349663) >>> 0);
    const ox = cx * CS, oz = cz * CS;
    const set = (wx, wy, wz, id, force = false) => {
      const x = wx - ox, z = wz - oz;
      if (x < 0 || x >= 16 || z < 0 || z >= 16 || wy <= 0 || wy >= CH) return;
      const i = idx(x, wy, z);
      const cur = data[i];
      if (force || cur === 0 || cur === B.short_grass || cur === B.snow || cur === B.oak_leaves || cur === B.birch_leaves || cur === B.spruce_leaves || cur === B.jungle_leaves || cur === B.acacia_leaves) data[i] = id;
    };
    const get = (wx, wy, wz) => {
      const x = wx - ox, z = wz - oz;
      if (x < 0 || x >= 16 || z < 0 || z >= 16 || wy < 0 || wy >= CH) return -1;
      return data[idx(x, wy, z)];
    };
    const attempts = 26;
    for (let n = 0; n < attempts; n++) {
      const wx = fcx * CS + ((rng() * 16) | 0), wz = fcz * CS + ((rng() * 16) | 0);
      const roll = rng(), roll2 = rng();
      const { h, biome } = this.heightInfo(wx, wz);
      if (h < SEA) continue;
      const y = h + 1;
      if (biome === 16) { if (roll < 0.02) this.hugeMushroom(wx, y, wz, roll2 < 0.5, rng, set); else if (roll < 0.1) set(wx, y, wz, roll2 < 0.5 ? B.red_mushroom : B.brown_mushroom); continue; }
      if (biome === 19) { if (roll < 0.05) { const hh = 6 + ((rng() * 18) | 0); for (let k = 0; k < hh; k++) { const r = Math.max(0, Math.round((1 - k / hh) * 2)); for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r) set(wx + dx, y + k, wz + dz, B.packed_ice, true); } } continue; }
      if (biome === 17) { if (roll < 0.04) set(wx, y, wz, B.dead_bush); else if (roll < 0.06) { for (let k = 0; k < 2; k++) set(wx, y + k, wz, B.cactus); } continue; }
      if (biome === 20 || biome === 21) continue;
      const treeChance = { 2: 0.03, 3: 0.35, 4: 0.35, 5: 0.32, 7: 0.04, 8: 0.08, 9: 0.6, 10: 0.04, 11: 0.12, 14: 0.7, 15: 0.2, 18: 0.4 }[biome] ?? 0;
      if (roll < treeChance && biome !== 6 && biome !== 1) {
        let kind = 'oak';
        if (biome === 4 || (biome === 3 && roll2 < 0.2)) kind = 'birch';
        if (biome === 5 || biome === 7 || biome === 8) kind = 'spruce';
        if (biome === 9) kind = roll2 < 0.6 ? 'jungle' : 'oak';
        if (biome === 10) kind = 'acacia';
        if (biome === 14) { if (roll2 < 0.08) { this.hugeMushroom(wx, y, wz, roll2 < 0.04, rng, set); continue; } kind = roll2 < 0.85 ? 'dark_oak' : 'birch'; }
        if (biome === 15) kind = 'cherry';
        if (biome === 18) kind = 'mangrove';
        this.tree(kind, wx, y, wz, rng, set);
        continue;
      }
      if (biome === 6) {
        if (roll < 0.06) { const hh = 1 + ((rng() * 3) | 0); for (let k = 0; k < hh; k++) set(wx, y + k, wz, B.cactus); }
        else if (roll < 0.12) set(wx, y, wz, B.dead_bush);
        continue;
      }
      if (biome === 1 || biome === 0) continue;
      if ((biome === 5 || biome === 3) && roll > 0.97) { set(wx, y, wz, B.sweet_berry_bush); continue; }
      if (roll < 0.55) set(wx, y, wz, biome === 5 && roll2 < 0.5 ? B.fern : B.short_grass);
      else if (roll < 0.6) {
        const flowers = biome === 11 ? [B.blue_orchid] : [B.dandelion, B.poppy, B.cornflower, B.oxeye_daisy, B.allium];
        set(wx, y, wz, flowers[(roll2 * flowers.length) | 0]);
      } else if (roll < 0.605) set(wx, y, wz, B.pumpkin);
      else if (roll < 0.61 && biome === 9) set(wx, y, wz, B.melon);
      else if (roll < 0.62) set(wx, y, wz, roll2 < 0.5 ? B.brown_mushroom : B.red_mushroom);
      else if (roll < 0.7 && h <= SEA + 2) {
        // sugar cane next to water
        let water = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.heightInfo(wx + dx, wz + dz).h < SEA) water = true;
        if (water) { const hh = 1 + ((rng() * 3) | 0); for (let k = 0; k < hh; k++) set(wx, y + k, wz, B.sugar_cane); }
      }
    }
  }

  hugeMushroom(x, y, z, red, rng, set) {
    const h = 5 + ((rng() * 3) | 0);
    for (let k = 0; k < h; k++) set(x, y + k, z, B.mushroom_stem, true);
    const cap = red ? B.red_mushroom_block : B.brown_mushroom_block;
    if (red) {
      for (let dy = h - 3; dy <= h; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        if (dy === h && edge) continue;
        if (dy < h && !edge) continue;
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        set(x + dx, y + dy, z + dz, cap);
      }
    } else for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (!(Math.abs(dx) === 3 && Math.abs(dz) === 3)) set(x + dx, y + h, z + dz, cap);
  }

  tree(kind, x, y, z, rng, set) {
    if (kind === 'dark_oak') {
      const L = B.dark_oak_leaves, W = B.dark_oak_log, h = 6 + ((rng() * 3) | 0);
      for (let k = 0; k < h; k++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, y + k, z + dz, W, true);
      for (let dy = h - 2; dy <= h + 1; dy++) {
        const r = dy > h ? 2 : 3;
        for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
          if ((dx === -r || dx === r + 1) && (dz === -r || dz === r + 1)) continue;
          if (rng() < 0.08) continue;
          set(x + dx, y + dy, z + dz, L);
        }
      }
      return;
    }
    if (kind === 'cherry') {
      const L = B.cherry_leaves, W = B.cherry_log, h = 5 + ((rng() * 2) | 0);
      for (let k = 0; k < h; k++) set(x, y + k, z, W, true);
      const branches = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(() => rng() < 0.6);
      if (!branches.length) branches.push([1, 0]);
      for (const [bx, bz] of branches) {
        let cx = x, cy = y + h - 2, cz = z;
        for (let k = 0; k < 3; k++) { cx += bx; cz += bz; if (k) cy++; set(cx, cy, cz, W, true); }
        for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -1; dy <= 1; dy++) {
          if (dx * dx + dz * dz + dy * dy * 3 > 10) continue;
          set(cx + dx, cy + 1 + dy, cz + dz, L);
        }
      }
      return;
    }
    if (kind === 'mangrove') {
      const L = B.mangrove_leaves, W = B.mangrove_log, h = 5 + ((rng() * 3) | 0);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) for (let k = -2; k < 2; k++) set(x + dx, y + k, z + dz, B.mangrove_roots, true);
      for (let k = 1; k < h + 1; k++) set(x, y + k, z, W, true);
      for (let dy = h - 1; dy <= h + 2; dy++) { const r = dy > h + 1 ? 1 : 2; for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (!(Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.6)) set(x + dx, y + dy, z + dz, L); }
      return;
    }
    const L = B[kind + '_leaves'], W = B[kind + '_log'];
    if (kind === 'spruce') {
      const h = 6 + ((rng() * 4) | 0);
      for (let k = 0; k < h; k++) set(x, y + k, z, W, true);
      let r = 0;
      for (let k = h; k >= 2; k--) {
        const yy = y + k;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 1 : 0) && (dx || dz || k === h)) set(x + dx, yy, z + dz, L);
        r = r >= 2 ? 0 : r + 1;
        if (k === h) r = 1;
      }
      set(x, y + h, z, L); set(x, y + h + 1, z, L);
      return;
    }
    if (kind === 'acacia') {
      const h = 5 + ((rng() * 2) | 0);
      const dir = rng() < 0.5 ? 1 : -1;
      let cx = x;
      for (let k = 0; k < h; k++) { if (k > 2) cx += dir * (k % 2); set(cx, y + k, z, W, true); }
      const ty = y + h;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) + Math.abs(dz) <= 4) set(cx + dx, ty, z + dz, L);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(cx + dx, ty + 1, z + dz, L);
      return;
    }
    const big = kind === 'jungle' && rng() < 0.3;
    const h = kind === 'birch' ? 5 + ((rng() * 3) | 0) : kind === 'jungle' ? (big ? 10 + ((rng() * 8) | 0) : 5 + ((rng() * 4) | 0)) : 4 + ((rng() * 3) | 0);
    for (let k = 0; k < h; k++) set(x, y + k, z, W, true);
    const top = y + h;
    for (let yy = top - 3; yy <= top; yy++) {
      const r = yy >= top - 1 ? 1 : 2 + (big ? 1 : 0);
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (yy === top || rng() < 0.5)) continue;
        set(x + dx, yy, z + dz, L);
      }
    }
    set(x, top + (kind === 'jungle' ? 1 : 0), z, L);
  }

  // ------------------------------------------------------------ villages
  villageAt(gx, gz) {
    const key = `${gx},${gz}`;
    this.villageCache ??= new Map();
    if (this.villageCache.has(key)) return this.villageCache.get(key);
    const r = mulberry32((this.seed * 7919 + gx * 92821 + gz * 68917) >>> 0);
    let v = null;
    if (r() < 0.7) {
      const x = gx * 320 + 60 + Math.floor(r() * 200), z = gz * 320 + 60 + Math.floor(r() * 200);
      const info = this.heightInfo(x, z);
      if ([2, 6, 10, 3].includes(info.biome) && info.h > SEA && info.h < 85) {
        const desert = info.biome === 6;
        const buildings = [];
        const slots = [[13, 0], [-13, 0], [0, 13], [0, -13], [13, 13], [-13, -13], [13, -13], [-13, 13], [26, 0], [0, 26]];
        const n = 5 + Math.floor(r() * 4);
        for (let i = 0; i < n && i < slots.length; i++) {
          const [ox, oz] = slots[i];
          const kind = i === 2 || i === 6 ? 'farm' : r() < 0.2 ? 'lamp_house' : 'house';
          const bx = x + ox, bz = z + oz;
          const bh = this.heightInfo(bx, bz).h;
          if (bh <= SEA || Math.abs(bh - info.h) > 6) continue;
          buildings.push({ kind, x: bx, z: bz, h: bh, size: kind === 'farm' ? 9 : 7, seed: (r() * 1e9) | 0 });
        }
        v = { x, z, h: info.h, desert, buildings, id: key };
      }
    }
    this.villageCache.set(key, v);
    return v;
  }
  villagesNear(x, z, radius = 1) {
    const gx = Math.floor(x / 320), gz = Math.floor(z / 320);
    const out = [];
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) { const v = this.villageAt(gx + dx, gz + dz); if (v) out.push(v); }
    return out;
  }
  placeVillages(cx, cz, data) {
    const ox = cx * CS, oz = cz * CS;
    for (const v of this.villagesNear(ox + 8, oz + 8)) {
      if (Math.abs(v.x - ox) > 60 || Math.abs(v.z - oz) > 60) continue;
      const set = (wx, wy, wz, id, meta = 0) => {
        const x = wx - ox, z = wz - oz;
        if (x < 0 || x >= 16 || z < 0 || z >= 16 || wy <= 0 || wy >= CH) return;
        data[idx(x, wy, z)] = id;
        if (meta) (this.pendingMeta ??= []).push([cx, cz, idx(x, wy, z), meta]);
      };
      const get = (wx, wy, wz) => { const x = wx - ox, z = wz - oz; if (x < 0 || x >= 16 || z < 0 || z >= 16) return -1; return data[idx(x, wy, z)]; };
      const wall = v.desert ? B.sandstone : B.oak_planks, corner = v.desert ? B.sandstone : B.oak_log, floor = v.desert ? B.sandstone : B.cobblestone;
      const roofSlab = v.desert ? B.sandstone_slab : B.oak_slab;
      // paths: from centre to each building
      const pathAt = (px, pz) => {
        const h = this.heightInfo(px, pz).h;
        const cur = get(px, h, pz);
        if (cur === B.grass_block || cur === B.dirt || cur === B.sand || cur === B.podzol) set(px, h, pz, v.desert ? B.sandstone : B.path);
        for (let y = h + 1; y < h + 3; y++) { const a = get(px, y, pz); if (a === B.short_grass || a === B.fern || a === B.dandelion || a === B.poppy) set(px, y, pz, 0); }
      };
      for (const b of v.buildings) {
        for (const w of [-1, 0, 1]) {
          for (let x = Math.min(v.x, b.x); x <= Math.max(v.x, b.x); x++) pathAt(x, v.z + w);
          for (let z = Math.min(v.z, b.z); z <= Math.max(v.z, b.z); z++) pathAt(b.x + w, z);
        }
      }
      // well
      const wy = v.h;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        for (let y = wy - 3; y <= wy + 4; y++) set(v.x + dx, y, v.z + dz, 0);
        set(v.x + dx, wy - 4, v.z + dz, B.cobblestone);
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        for (let y = wy - 3; y <= wy; y++) set(v.x + dx, y, v.z + dz, edge ? B.cobblestone : B.water);
        if (edge) set(v.x + dx, wy + 1, v.z + dz, B.cobblestone_slab);
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) { set(v.x + dx, wy + 1, v.z + dz, B.oak_fence); set(v.x + dx, wy + 2, v.z + dz, B.oak_fence); }
        set(v.x + dx, wy + 3, v.z + dz, roofSlab);
      }
      set(v.x, wy + 2, v.z, B.lantern);
      for (const b of v.buildings) this.placeBuilding(b, v, set, get, { wall, corner, floor, roofSlab });
    }
  }
  placeBuilding(b, v, set, get, M) {
    const r = mulberry32(b.seed);
    const s = b.size, x0 = b.x - (s >> 1), z0 = b.z - (s >> 1), h = b.h;
    if (b.kind === 'farm') {
      for (let dx = 0; dx < s; dx++) for (let dz = 0; dz < s; dz++) {
        const x = x0 + dx, z = z0 + dz;
        for (let y = h + 1; y < h + 4; y++) set(x, y, z, 0);
        const edge = dx === 0 || dz === 0 || dx === s - 1 || dz === s - 1;
        if (edge) { set(x, h, z, B.oak_log); continue; }
        if (dx === (s >> 1)) { set(x, h, z, B.water); continue; }
        set(x, h, z, B.farmland_wet);
        const crops = [B.wheat_0, B.carrots_0, B.potatoes_0];
        set(x, h + 1, z, crops[(dz + (b.seed & 3)) % 3] + 4 + Math.floor(r() * 4));
      }
      return;
    }
    // foundation and clearing
    for (let dx = 0; dx < s; dx++) for (let dz = 0; dz < s; dz++) {
      const x = x0 + dx, z = z0 + dz;
      for (let y = h - 4; y < h; y++) { const c = get(x, y, z); if (c === 0 || c === B.water || c === -1 || BLOCKS_REPLACE.has(c)) set(x, y, z, M.floor); }
      set(x, h, z, M.floor);
      for (let y = h + 1; y <= h + 8; y++) set(x, y, z, 0);
    }
    // walls
    for (let dx = 0; dx < s; dx++) for (let dz = 0; dz < s; dz++) {
      const edgeX = dx === 0 || dx === s - 1, edgeZ = dz === 0 || dz === s - 1;
      if (!edgeX && !edgeZ) continue;
      const x = x0 + dx, z = z0 + dz;
      for (let y = h + 1; y <= h + 3; y++) {
        let id = edgeX && edgeZ ? M.corner : M.wall;
        if (y === h + 2 && !(edgeX && edgeZ) && ((edgeX && dz === (s >> 1)) || (edgeZ && dx === (s >> 1)))) id = B.glass_pane;
        set(x, y, z, id);
      }
    }
    // door facing the village centre
    const toX = v.x - b.x, toZ = v.z - b.z;
    let ddx = 0, ddz = 0, dmeta = 0;
    if (Math.abs(toX) > Math.abs(toZ)) { ddx = Math.sign(toX); dmeta = ddx > 0 ? 3 : 1; } else { ddz = Math.sign(toZ) || 1; dmeta = ddz > 0 ? 0 : 2; }
    const half = s >> 1;
    const doorX = b.x + ddx * half, doorZ = b.z + ddz * half;
    set(doorX, h + 1, doorZ, B.oak_door, dmeta);
    set(doorX, h + 2, doorZ, B.oak_door, dmeta | 4);
    set(doorX + ddx, h, doorZ + ddz, v.desert ? B.sandstone_stairs : B.cobblestone_stairs, [2, 1, 0, 3][dmeta]);
    // roof
    for (let layer = 0; layer < 3; layer++) {
      const y = h + 4 + layer;
      for (let dx = layer - 1; dx <= s - layer; dx++) for (let dz = layer - 1; dz <= s - layer; dz++) {
        const top = layer === 2 || dx === layer - 1 || dz === layer - 1 || dx === s - layer || dz === s - layer;
        if (layer < 2 && !top) continue;
        set(x0 + dx, y, z0 + dz, layer === 2 ? M.roofSlab : (v.desert ? B.sandstone : B.spruce_planks));
      }
    }
    // interior
    const jobs = [B.composter, B.lectern, B.barrel, B.smoker, B.blast_furnace, B.smithing_table, B.grindstone, B.fletching_table, B.loom, B.cartography_table, B.brewing_stand, B.stonecutter, B.cauldron];
    set(x0 + 1, h + 1, z0 + 1, jobs[(b.seed >>> 3) % jobs.length]);
    set(x0 + s - 2, h + 1, z0 + 1, B.bed, 0 | 4);
    set(x0 + s - 2, h + 1, z0 + 2, B.bed, 0);
    set(x0 + 1, h + 1, z0 + s - 2, B.chest, 4);
    set(x0 + 1, h + 3, z0 + half, B.torch, 2);
    set(x0 + s - 2, h + 3, z0 + half, B.torch, 4);
    if (b.kind === 'lamp_house') { set(b.x + ddx * (half + 2), h + 1, b.z + ddz * (half + 2) + 1, B.oak_fence); set(b.x + ddx * (half + 2), h + 2, b.z + ddz * (half + 2) + 1, B.oak_fence); set(b.x + ddx * (half + 2), h + 3, b.z + ddz * (half + 2) + 1, B.lantern); }
  }

  // ------------------------------------------------------------ dungeons
  placeDungeon(cx, cz, data) {
    for (let dcx = -1; dcx <= 1; dcx++) for (let dcz = -1; dcz <= 1; dcz++) {
      const fx = cx + dcx, fz = cz + dcz;
      const r = mulberry32((this.seed ^ (fx * 4517 + fz * 7703 + 991)) >>> 0);
      if (r() > 0.06) continue;
      const x = fx * CS + 4 + Math.floor(r() * 8), z = fz * CS + 4 + Math.floor(r() * 8), y = 14 + Math.floor(r() * 26);
      if (this.heightInfo(x, z).h < y + 8) continue;
      const mob = Math.floor(r() * 3);
      const ox = cx * CS, oz = cz * CS;
      const set = (wx, wy, wz, id, meta = 0) => {
        const lx = wx - ox, lz = wz - oz;
        if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16) return;
        data[idx(lx, wy, lz)] = id;
        if (meta) (this.pendingMeta ??= []).push([cx, cz, idx(lx, wy, lz), meta]);
      };
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 4; dy++) {
        const edge = Math.abs(dx) === 4 || Math.abs(dz) === 4 || dy === -1 || dy === 4;
        set(x + dx, y + dy, z + dz, edge ? (hash3(this.seed, x + dx, y + dy, z + dz) < 0.4 ? B.mossy_cobblestone : B.cobblestone) : 0);
      }
      set(x, y, z, B.spawner, mob + 1);
      set(x + 3, y, z - 3, B.chest, 4);
      if (r() < 0.6) set(x - 3, y, z + 3, B.chest, 4);
    }
  }

  placeStronghold(cx, cz, data) {
    const s = this.stronghold;
    const ox = cx * CS, oz = cz * CS;
    if (Math.abs(s.x - (ox + 8)) > 24 || Math.abs(s.z - (oz + 8)) > 24) return;
    const set = (wx, wy, wz, id) => {
      const x = wx - ox, z = wz - oz;
      if (x < 0 || x >= 16 || z < 0 || z >= 16) return;
      data[idx(x, wy, z)] = id;
    };
    const rng = mulberry32(this.seed + 5);
    // room 15x8x15 of stone bricks
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) for (let dy = -1; dy <= 7; dy++) {
      const edge = Math.abs(dx) === 7 || Math.abs(dz) === 7 || dy === -1 || dy === 7;
      const r = hash3(this.seed, s.x + dx, s.y + dy, s.z + dz);
      set(s.x + dx, s.y + dy, s.z + dz, edge ? (r < 0.2 ? B.mossy_stone_bricks : B.stone_bricks) : 0);
    }
    // tunnel up to the surface marker (staircase-ish shaft)
    for (let dy = 0; dy < 40; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const wx = s.x + 7 + 3 + dx, wz = s.z + dz, wy = s.y + dy;
      const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
      if (wy >= CH) continue;
      if (dx === 0 && dz === 0) set(wx, wy, wz, B.ladder); else if (edge) set(wx, wy, wz, B.stone_bricks);
    }
    for (let dy = 0; dy < 3; dy++) set(s.x + 7, s.y + dy, s.z, 0);
    for (let dy = 0; dy < 3; dy++) set(s.x + 8, s.y + dy, s.z, 0);
    // lava pool + portal frame ring around 3x3 hole
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(s.x + dx, s.y - 1, s.z + dz, B.lava);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if ((Math.abs(dx) === 2) !== (Math.abs(dz) === 2)) set(s.x + dx, s.y, s.z + dz, rng() < 0.1 ? B.end_portal_frame_eye : B.end_portal_frame);
    }
    // stairs-ish platform and torches
    set(s.x - 6, s.y + 3, s.z - 6, B.torch); set(s.x + 6, s.y, s.z + 6, B.torch); set(s.x - 6, s.y, s.z + 6, B.torch); set(s.x + 6, s.y, s.z - 6, B.torch);
    set(s.x - 5, s.y, s.z - 5, B.bookshelf); set(s.x - 5, s.y + 1, s.z - 5, B.bookshelf);
    set(s.x + 5, s.y, s.z + 5, B.chest);
  }

  // ------------------------------------------------------------ nether
  genNether(cx, cz, data, biomes) {
    const x0 = cx * CS, z0 = cz * CS;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const bn = this.n3.fbm2(wx / 140, wz / 140, 2), bn2 = this.n4.fbm2(wx / 140 + 50, wz / 140, 2);
      const nb = bn > 0.3 ? 24 : bn < -0.3 ? 25 : bn2 > 0.25 ? 22 : bn2 < -0.25 ? 23 : 12;
      biomes[x | (z << 4)] = nb;
      const soul = nb === 24;
      for (let y = 0; y < CH; y++) {
        let id = 0;
        if (y === 0 || y === CH - 1 || (y < 4 && hash3(this.seed, wx, y, wz) < 0.5) || (y > CH - 5 && hash3(this.seed, wx, y, wz) < 0.5)) id = B.bedrock;
        else {
          let d = this.n1.fbm3(wx / 60, y / 36, wz / 60, 2) + this.n2.noise3(wx / 18, y / 14, wz / 18) * 0.25;
          const edge = Math.max(0, (24 - y) / 24, (y - (CH - 24)) / 24);
          d += edge * 1.2 - 0.05;
          if (d > 0) id = B.netherrack;
          else if (y <= 31) id = B.lava;
        }
        data[idx(x, y, z)] = id;
      }
      // surface decorations
      for (let y = 1; y < CH - 1; y++) {
        const i = idx(x, y, z);
        if (data[i] === B.netherrack && data[idx(x, y + 1, z)] === 0) {
          const r = hash3(this.seed, wx, y, wz);
          const nb = biomes[x | (z << 4)];
          if (soul) { data[i] = r < 0.5 ? B.soul_sand : B.soul_soil; if (r < 0.01 && y > 32) for (let k = 1; k < 6; k++) if (y + k < CH - 1 && !data[idx(x, y + k, z)]) data[idx(x, y + k, z)] = B.bone_block; }
          else if (nb === 22 && y > 31) { data[i] = B.crimson_nylium; const above = idx(x, y + 1, z); if (r < 0.15) data[above] = B.crimson_roots; else if (r < 0.2) data[above] = B.crimson_fungus; else if (r < 0.215) this.netherTree(data, x, y + 1, z, false); }
          else if (nb === 23 && y > 31) { data[i] = B.warped_nylium; const above = idx(x, y + 1, z); if (r < 0.15) data[above] = B.warped_roots; else if (r < 0.2) data[above] = B.warped_fungus; else if (r < 0.215) this.netherTree(data, x, y + 1, z, true); }
          else if (nb === 25) data[i] = r < 0.55 ? B.basalt : r < 0.85 ? B.blackstone : B.magma_block;
          else if (r < 0.04 && y > 31) data[i] = B.crimson_nylium;
          if (y === 31 || y === 32) if (r < 0.15) data[i] = B.magma_block;
        }
        if (data[i] === B.netherrack && data[idx(x, y - 1, z)] === 0) {
          // glowstone clusters hanging
          if (hash3(this.seed + 7, wx >> 2, y >> 2, wz >> 2) < 0.04 && hash3(this.seed, wx, y, wz) < 0.7) {
            for (let k = 1; k < 4; k++) if (data[idx(x, y - k, z)] === 0 && hash3(this.seed + k, wx, y, wz) < 0.7) data[idx(x, y - k, z)] = B.glowstone;
          }
        }
      }
    }
    const rng = mulberry32((this.seed ^ (cx * 9283 + cz * 7741)) >>> 0);
    const vein = (id, count, size, minY, maxY) => {
      for (let i = 0; i < count; i++) {
        let x = (rng() * 16) | 0, y = minY + ((rng() * (maxY - minY)) | 0), z = (rng() * 16) | 0;
        for (let k = 0; k < size; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH && data[idx(x, y, z)] === B.netherrack) data[idx(x, y, z)] = id;
          const d = (rng() * 6) | 0;
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    };
    vein(B.nether_quartz_ore, 14, 10, 10, 118); vein(B.nether_gold_ore, 8, 8, 10, 118);
    vein(B.ancient_debris, 1, 2, 8, 22); vein(B.blackstone, 2, 20, 4, 40); vein(B.gravel, 2, 20, 28, 40);
    if (rng() < 0.3) vein(B.basalt, 3, 30, 30, 90);
    // mini fortress bridges: deterministic nether brick corridors on a grid
    if (((cx & 7) === 3) && hash3(this.seed, cx >> 3, 0, cz >> 3) < 0.5) {
      for (let z = 0; z < 16; z++) for (let x = 6; x <= 10; x++) {
        for (let y = 60; y <= 66; y++) {
          const wall = x === 6 || x === 10, floor = y === 60, roof = y === 66;
          data[idx(x, y, z)] = floor || roof || (wall && (z % 4 !== 2 || y < 62 || y > 64)) ? B.nether_bricks : 0;
        }
        if (z % 8 === 0) for (let y = 30; y < 60; y++) { data[idx(7, y, z)] = B.nether_bricks; data[idx(9, y, z)] = B.nether_bricks; }
      }
    }
  }

  netherTree(data, x, y, z, warped) {
    const h = 4 + ((hash3(this.seed, x, y, z) * 6) | 0);
    const stem = warped ? B.warped_stem : B.crimson_stem, wart = warped ? B.warped_wart_block : B.nether_wart_block;
    for (let k = 0; k < h; k++) if (y + k < CH - 2) data[idx(x, y + k, z)] = stem;
    for (let dy = h - 3; dy <= h; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const xx = x + dx, zz = z + dz, yy = y + dy;
      if (xx < 0 || xx > 15 || zz < 0 || zz > 15 || yy >= CH - 1) continue;
      const r = Math.abs(dx) + Math.abs(dz);
      if (r > (dy === h ? 1 : 3)) continue;
      if (data[idx(xx, yy, zz)]) continue;
      data[idx(xx, yy, zz)] = hash3(this.seed + 3, xx, yy, zz) < 0.08 ? B.shroomlight : wart;
    }
  }

  // ------------------------------------------------------------ end
  genEnd(cx, cz, data, biomes) {
    const x0 = cx * CS, z0 = cz * CS;
    biomes.fill(13);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const d = Math.sqrt(wx * wx + wz * wz);
      const edge = this.n1.fbm2(wx / 40, wz / 40, 3) * 18;
      let radius = 90 + edge;
      let top = 0, bot = 0;
      if (d < radius) {
        const f = 1 - d / radius;
        top = Math.floor(56 + f * 4 + this.n2.noise2(wx / 25, wz / 25) * 2);
        bot = Math.floor(56 - Math.sqrt(f) * 34);
      } else if (d > 700) {
        // outer islands
        const n = this.n3.fbm2(wx / 120, wz / 120, 3);
        if (n > 0.25) { top = Math.floor(55 + (n - 0.25) * 30); bot = Math.floor(55 - (n - 0.25) * 60); }
      }
      for (let y = bot; y <= top && top > 0; y++) data[idx(x, y, z)] = B.end_stone;
      if (d > 700 && top > 0 && hash3(this.seed, wx, 7, wz) < 0.006) { const hh = 3 + ((hash3(this.seed, wx, 8, wz) * 6) | 0); for (let k = 1; k <= hh; k++) data[idx(x, top + k, z)] = k === hh ? B.chorus_flower : B.chorus_plant; }
    }
    // obsidian pillars
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2;
      const px = Math.round(Math.cos(a) * 42), pz = Math.round(Math.sin(a) * 42);
      const r = 2 + (p % 3), h = 76 + ((p * 7) % 5) * 6;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        const x = px + dx - x0, z = pz + dz - z0;
        if (x < 0 || x >= 16 || z < 0 || z >= 16) continue;
        for (let y = 50; y < h; y++) data[idx(x, y, z)] = B.obsidian;
        if (dx === 0 && dz === 0) data[idx(x, h, z)] = B.bedrock;
      }
    }
    // exit portal frame (bedrock), portal filled after dragon death
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = dx - x0, z = dz - z0;
      if (x < 0 || x >= 16 || z < 0 || z >= 16) continue;
      const dd = dx * dx + dz * dz;
      if (dd <= 10) data[idx(x, 59, z)] = B.bedrock;
      if (dd > 4 && dd <= 10) data[idx(x, 60, z)] = B.bedrock;
      if (dd <= 4) data[idx(x, 60, z)] = 0;
      if (dx === 0 && dz === 0) for (let y = 60; y < 64; y++) data[idx(x, y, z)] = B.bedrock;
    }
  }

  pillarTops() {
    const out = [];
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2;
      out.push({ x: Math.round(Math.cos(a) * 42) + 0.5, y: 76 + ((p * 7) % 5) * 6 + 1, z: Math.round(Math.sin(a) * 42) + 0.5 });
    }
    return out;
  }
}

export function biomeColors(biome) { return BIOMES[biome] ?? BIOMES[2]; }
