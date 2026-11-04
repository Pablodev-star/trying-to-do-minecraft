// World structures (original layouts): desert temple, jungle temple, igloo, swamp hut, shipwreck,
// ruined portal, bandit outpost, abandoned mineshaft, nether bastion, end city.
import { B } from './registry.js';
import { mulberry32, hash3 } from './noise.js';

// Each builder receives (set, ctx) where set(x, y, z, id, meta) writes world coordinates (clipped to
// the chunk being generated) and ctx has { x, y, z, rng, seed, h(x,z) }.

function box(set, x0, y0, z0, x1, y1, z1, id, hollow = false, meta = 0) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const edge = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
    if (!hollow || edge) set(x, y, z, id, meta); else set(x, y, z, 0);
  }
}

export const STRUCTURES = {
  desert_temple({ x, y, z, rng }, set) {
    const s = 10;
    for (let layer = 0; layer < 7; layer++) {
      const r = s - layer;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        const edge = Math.abs(dx) === r || Math.abs(dz) === r;
        set(x + dx, y + layer, z + dz, layer === 0 ? B.sandstone : edge ? (layer % 2 ? B.orange_terracotta : B.sandstone) : 0);
      }
    }
    // foundation and entrance
    for (let dx = -s; dx <= s; dx++) for (let dz = -s; dz <= s; dz++) for (let k = 1; k < 6; k++) set(x + dx, y - k, z + dz, B.sandstone);
    for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, z - s, 0);
    // towers
    for (const tx of [-s, s]) for (let dy = 0; dy < 10; dy++) for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + tx + (tx > 0 ? -a : a), y + dy, z - s + b, dy % 3 === 0 ? B.orange_terracotta : B.sandstone);
    // hidden chamber with TNT trap and chests
    box(set, x - 3, y - 12, z - 3, x + 3, y - 6, z + 3, B.sandstone, true);
    for (let k = -11; k < 0; k++) set(x, y + k, z, 0);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { set(x + dx, y - 13, z + dz, B.tnt); }
    set(x, y - 12, z, B.stone_pressure_plate);
    set(x, y - 11, z, 0);
    for (const [cx, cz, m] of [[-2, 0, 1], [2, 0, 3], [0, -2, 2], [0, 2, 0]]) set(x + cx, y - 11, z + cz, B.chest, 4 | m);
    set(x, y, z, B.blue_terracotta_dummy ?? B.orange_terracotta);
    void rng;
  },

  jungle_temple({ x, y, z }, set) {
    box(set, x - 6, y, z - 7, x + 6, y + 7, z + 7, B.mossy_cobblestone, true);
    for (let dx = -6; dx <= 6; dx++) for (let dz = -7; dz <= 7; dz++) set(x + dx, y + 8, z + dz, (dx + dz) % 2 ? B.cobblestone : B.mossy_cobblestone);
    box(set, x - 4, y + 8, z - 5, x + 4, y + 11, z + 5, B.mossy_cobblestone, true);
    for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, z - 7, 0);
    for (let k = 1; k < 6; k++) for (let dx = -6; dx <= 6; dx++) for (let dz = -7; dz <= 7; dz++) set(x + dx, y - k, z + dz, B.cobblestone);
    // tripwire-like trap: hidden dispenser behind a pressure plate
    set(x, y + 1, z - 3, B.stone_pressure_plate);
    set(x - 5, y + 1, z - 3, B.dispenser, 5);
    for (let dx = -4; dx < 0; dx++) set(x + dx, y + 1, z - 3, B.redstone_wire);
    set(x + 4, y + 1, z + 5, B.chest, 4 | 2);
    set(x - 4, y + 1, z + 5, B.chest, 4 | 2);
    set(x - 5, y + 1, z + 5, B.lever, 4);
  },

  igloo({ x, y, z, rng }, set) {
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 4; dy++) {
      const d = Math.sqrt(dx * dx + dz * dz + (dy * 1.1) ** 2);
      if (d <= 4.3) set(x + dx, y + dy, z + dz, d > 3.4 ? B.snow_block : 0);
    }
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) set(x + dx, y - 1, z + dz, B.snow_block);
    set(x, y + 1, z - 4, 0); set(x, y, z - 4, 0); set(x, y + 1, z - 5, 0); set(x, y, z - 5, 0);
    set(x - 2, y, z + 1, B.bed, 0 | 4); set(x - 2, y, z + 2, B.bed, 0);
    set(x + 2, y, z + 2, B.furnace, 0); set(x + 2, y, z, B.crafting_table);
    set(x, y + 2, z + 2, B.torch, 0 + 1);
    if (rng() < 0.5) {
      // basement with a brewing stand and a chest
      for (let k = 1; k <= 8; k++) set(x, y - k, z, B.ladder, 0);
      box(set, x - 3, y - 13, z - 3, x + 3, y - 9, z + 3, B.stone_bricks, true);
      set(x, y - 12, z + 2, B.brewing_stand); set(x + 2, y - 12, z + 2, B.chest, 4); set(x - 2, y - 12, z + 2, B.cauldron, 3);
      set(x, y - 10, z, B.torch);
    }
  },

  witch_hut({ x, y, z }, set) {
    const h = Math.max(y, 63) + 2;
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) for (let k = h - 6; k < h; k++) set(x + px, k, z + pz, B.spruce_log);
    box(set, x - 3, h, z - 3, x + 3, h, z + 3, B.spruce_planks);
    box(set, x - 3, h + 1, z - 2, x + 3, h + 3, z + 3, B.spruce_planks, true);
    for (let dx = -4; dx <= 4; dx++) for (let dz = -3; dz <= 4; dz++) set(x + dx, h + 4, z + dz, B.spruce_slab);
    set(x, h + 1, z - 2, 0); set(x, h + 2, z - 2, 0);
    set(x - 2, h + 2, z - 2, B.glass_pane); set(x + 2, h + 2, z - 2, B.glass_pane);
    set(x + 2, h + 1, z + 2, B.cauldron, 2); set(x - 2, h + 1, z + 2, B.crafting_table); set(x, h + 1, z + 2, B.brewing_stand);
    set(x - 2, h + 1, z, B.red_mushroom);
    return { spawn: ['witch', x, h + 1, z] };
  },

  shipwreck({ x, y, z, rng }, set) {
    const floor = y - 1;
    const tilt = rng() < 0.5;
    for (let dz = -9; dz <= 9; dz++) {
      const w = Math.max(1, 3 - Math.floor(Math.abs(dz) / 4));
      for (let dx = -w; dx <= w; dx++) {
        set(x + dx, floor + 1, z + dz, B.spruce_planks);
        if (Math.abs(dx) === w) for (let k = 2; k <= (tilt && dx > 0 ? 2 : 3); k++) set(x + dx, floor + k, z + dz, rng() < 0.15 ? 0 : B.oak_planks);
      }
    }
    for (let k = 2; k < 9; k++) if (rng() < 0.85) set(x, floor + k, z - 2, B.spruce_log);
    for (let dx = -2; dx <= 2; dx++) for (let k = 5; k < 8; k++) if (rng() < 0.4) set(x + dx, floor + k, z - 2, B.white_wool);
    set(x, floor + 2, z + 7, B.chest, 4); set(x + 1, floor + 2, z - 7, B.chest, 4);
  },

  ruined_portal({ x, y, z, rng }, set) {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (rng() < 0.7) set(x + dx, y - 1, z + dz, rng() < 0.3 ? B.netherrack : rng() < 0.5 ? B.magma_block : B.stone_bricks);
    for (let a = -1; a <= 2; a++) for (let h = 0; h < 5; h++) {
      const frame = a === -1 || a === 2 || h === 0 || h === 4;
      if (frame && rng() < 0.75) set(x + a, y + h, z, rng() < 0.15 ? B.crying_obsidian : B.obsidian);
    }
    set(x + 2, y, z + 2, B.chest, 4);
    for (let i = 0; i < 4; i++) set(x - 3 + ((rng() * 7) | 0), y, z - 3 + ((rng() * 7) | 0), B.gold_block);
  },

  outpost({ x, y, z, rng }, set) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let k = 1; k < 4; k++) set(x + dx, y - k, z + dz, B.cobblestone);
    for (let dy = 0; dy < 16; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2, corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
      if (dy % 5 === 0) set(x + dx, y + dy, z + dz, B.dark_oak_planks);
      else if (corner) set(x + dx, y + dy, z + dz, B.dark_oak_log);
      else if (edge) set(x + dx, y + dy, z + dz, dy % 5 === 2 && (dx === 0 || dz === 0) ? 0 : B.birch_planks);
      else set(x + dx, y + dy, z + dz, dx === 0 && dz === 0 ? B.ladder : 0);
    }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { set(x + dx, y + 16, z + dz, B.dark_oak_planks); if (Math.abs(dx) === 3 || Math.abs(dz) === 3) set(x + dx, y + 17, z + dz, B.dark_oak_fence); }
    for (let dy = 1; dy < 16; dy++) set(x, y + dy, z, B.ladder, 0);
    set(x + 1, y + 17, z + 1, B.chest, 4);
    set(x - 1, y + 17, z - 1, B.torch);
    return { spawn: ['bandit', x + 0.5, y + 17, z + 0.5], spawn2: ['bandit', x + 4, y, z + 4], spawn3: ['bandit', x - 4, y, z - 3] };
  },

  bastion({ x, y, z, rng }, set) {
    box(set, x - 8, y, z - 8, x + 8, y + 12, z + 8, B.blackstone, true);
    for (let dy = 0; dy <= 12; dy += 4) for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) if (Math.abs(dx) === 8 || Math.abs(dz) === 8) set(x + dx, y + dy, z + dz, B.polished_blackstone_bricks);
    for (let dy = 1; dy <= 4; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, z - 8, 0);
    box(set, x - 7, y + 5, z - 7, x + 7, y + 5, z + 7, B.polished_blackstone_bricks);
    for (let i = 0; i < 20; i++) set(x - 7 + ((rng() * 15) | 0), y + 1, z - 7 + ((rng() * 15) | 0), B.gilded_blackstone);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(x + dx, y + 6, z + dz, B.gold_block);
    set(x + 3, y + 6, z + 3, B.chest, 4); set(x - 3, y + 1, z + 5, B.chest, 4);
    for (const [lx, lz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) set(x + lx, y + 2, z + lz, B.lantern);
    return { spawn: ['ash_goblin', x, y + 1, z], spawn2: ['hellboar', x + 4, y + 1, z - 4], spawn3: ['ash_goblin', x - 3, y + 6, z] };
  },

  end_city({ x, y, z, rng }, set) {
    let cy = y;
    const floors = 3 + ((rng() * 3) | 0);
    for (let f = 0; f < floors; f++) {
      const r = 4 - (f % 2);
      box(set, x - r, cy, z - r, x + r, cy + 5, z + r, B.purpur_block, true);
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) === r && Math.abs(dz) === r) for (let k = 0; k <= 5; k++) set(x + dx, cy + k, z + dz, B.purpur_pillar);
      for (let dy = 1; dy <= 3; dy++) set(x, cy + dy, z - r, 0);
      for (let k = 1; k <= 5; k++) set(x + r - 1, cy + k, z + r - 1, B.ladder, 2);
      set(x + r - 1, cy + 5, z + r - 1, 0);
      set(x - r + 1, cy + 3, z, B.end_rod);
      cy += 6;
    }
    box(set, x - 5, cy, z - 5, x + 5, cy, z + 5, B.purpur_block);
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) if (Math.abs(dx) === 5 || Math.abs(dz) === 5) set(x + dx, cy + 1, z + dz, B.end_stone_bricks);
    set(x, cy + 1, z, B.chest, 4); set(x + 2, cy + 1, z + 2, B.chest, 4);
    set(x - 3, cy + 1, z - 3, B.end_rod); set(x + 3, cy + 1, z - 3, B.end_rod);
    return { spawn: ['purpur_sentinel', x + 3, cy - 5, z], spawn2: ['purpur_sentinel', x - 2, cy + 1, z + 3], spawn3: ['purpur_sentinel', x, cy - 11, z - 2] };
  },
};

// Underground mineshaft corridors crossing this chunk (deterministic per region)
export function mineshaft(gen, cx, cz, set, data, idx, CS) {
  const rx = Math.floor(cx / 6), rz = Math.floor(cz / 6);
  const r = mulberry32((gen.seed ^ (rx * 7349 + rz * 5281 + 77)) >>> 0);
  if (r() > 0.45) return;
  const y = 18 + Math.floor(r() * 20);
  const ox = rx * 6 * CS + 8, oz = rz * 6 * CS + 8;
  const corridors = [];
  let px = ox, pz = oz;
  for (let i = 0; i < 8; i++) {
    const horiz = r() < 0.5, len = 12 + Math.floor(r() * 24), sign = r() < 0.5 ? -1 : 1;
    corridors.push({ x: px, z: pz, horiz, len, sign });
    if (horiz) px += len * sign; else pz += len * sign;
  }
  for (const c of corridors) {
    for (let i = 0; i <= c.len; i++) {
      const bx = c.horiz ? c.x + i * c.sign : c.x, bz = c.horiz ? c.z : c.z + i * c.sign;
      for (let w = -1; w <= 1; w++) for (let k = 0; k < 3; k++) {
        const wx = c.horiz ? bx : bx + w, wz = c.horiz ? bz + w : bz;
        set(wx, y + k, wz, 0);
      }
      set(bx, y - 1, bz, B.oak_planks);
      if (i % 4 === 0) {
        for (const w of [-1, 1]) for (let k = 0; k < 2; k++) set(c.horiz ? bx : bx + w, y + k, c.horiz ? bz + w : bz, B.oak_fence);
        for (let w = -1; w <= 1; w++) set(c.horiz ? bx : bx + w, y + 2, c.horiz ? bz + w : bz, B.oak_planks);
        if (hash3(gen.seed, bx, y, bz) < 0.3) set(bx, y + 1, bz + (c.horiz ? 1 : 0), B.torch, 0);
      } else if (hash3(gen.seed, bx, y + 1, bz) < 0.7) set(bx, y, bz, B.rail, c.horiz ? 1 : 0);
      if (hash3(gen.seed, bx, y + 2, bz) < 0.08) set(bx, y + 2, bz, B.cobweb);
      if (hash3(gen.seed + 1, bx, y, bz) < 0.012) set(bx + (c.horiz ? 0 : 1), y, bz + (c.horiz ? 1 : 0), B.chest, 4);
      if (hash3(gen.seed + 2, bx, y, bz) < 0.004) set(bx, y + 1, bz, B.spawner, 3);
    }
  }
  void data; void idx;
}
