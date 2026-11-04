// Terrain generators for the Overworld, Nether and End.
import { Simplex, hash3, mulberry32 } from './noise.js';
import { B } from './registry.js';

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
    let biome;
    if (h < SEA - 1) biome = 0;
    else if (h <= SEA + 1 && t > -0.45) biome = 1;
    else if (m > 18) biome = 8;
    else if (t < -0.45) biome = 7;
    else if (t < -0.2) biome = 5;
    else if (t > 0.38 && hum < 0.05) biome = 6;
    else if (t > 0.3 && hum > 0.25) biome = 9;
    else if (t > 0.3) biome = 10;
    else if (hum > 0.35 && h < 66) biome = 11;
    else if (hum > 0.1) biome = 3;
    else if (hum < -0.25) biome = 2;
    else if (hum < 0) biome = 4;
    else biome = 2;
    return { h, biome, t };
  }

  generate(cx, cz) {
    const data = new Uint8Array(CS * CS * CH);
    const biomes = new Uint8Array(CS * CS);
    if (this.dim === 'nether') this.genNether(cx, cz, data, biomes);
    else if (this.dim === 'end') this.genEnd(cx, cz, data, biomes);
    else this.genOverworld(cx, cz, data, biomes);
    return { data, biomes };
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
        else if (y < h - 4) id = B.stone;
        else if (y < h) {
          if (biome === 6 || biome === 1) id = y < h - 2 ? B.sandstone : B.sand;
          else if (biome === 0) id = B.sand;
          else if (biome === 8 && h > 95) id = B.stone;
          else id = B.dirt;
        } else if (y === h) {
          if (biome === 6 || biome === 1) id = B.sand;
          else if (biome === 0) id = r < 0.3 ? B.gravel : r < 0.4 ? B.clay : B.sand;
          else if (biome === 8 && h > 100) id = h > 110 ? B.snow_block : B.stone;
          else if (biome === 7) id = B.snowy_grass;
          else if (biome === 5 && r < 0.25) id = B.podzol;
          else id = h < SEA ? B.dirt : B.grass_block;
        } else if (y <= SEA) {
          id = (biome === 7 && y === SEA) ? B.ice : B.water;
        }
        data[idx(x, y, z)] = id;
      }
      if (biome === 7 && h >= SEA) data[idx(x, h + 1, z)] = B.snow;
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
    if (biomes[0] === 8) vein(B.emerald_ore, 4, 1, 4, 32);
    // features (trees etc) from this and neighbouring chunks
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.featuresOverworld(cx + dx, cz + dz, cx, cz, data);
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
      const treeChance = { 2: 0.03, 3: 0.35, 4: 0.35, 5: 0.32, 7: 0.04, 8: 0.08, 9: 0.6, 10: 0.04, 11: 0.12 }[biome] ?? 0;
      if (roll < treeChance && biome !== 6 && biome !== 1) {
        let kind = 'oak';
        if (biome === 4 || (biome === 3 && roll2 < 0.2)) kind = 'birch';
        if (biome === 5 || biome === 7 || biome === 8) kind = 'spruce';
        if (biome === 9) kind = roll2 < 0.6 ? 'jungle' : 'oak';
        if (biome === 10) kind = 'acacia';
        this.tree(kind, wx, y, wz, rng, set);
        continue;
      }
      if (biome === 6) {
        if (roll < 0.06) { const hh = 1 + ((rng() * 3) | 0); for (let k = 0; k < hh; k++) set(wx, y + k, wz, B.cactus); }
        else if (roll < 0.12) set(wx, y, wz, B.dead_bush);
        continue;
      }
      if (biome === 1 || biome === 0) continue;
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

  tree(kind, x, y, z, rng, set) {
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
    biomes.fill(12);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const soul = this.n3.fbm2(wx / 90, wz / 90, 2) > 0.35;
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
          if (soul) data[i] = r < 0.5 ? B.soul_sand : B.soul_soil;
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
