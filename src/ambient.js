// Ambient "display tick": every frame a few hundred random blocks around the player are
// sampled and the interesting ones emit particles (torch flames and smoke, fire, lava embers,
// lit furnaces, portals, drips under water/lava, falling leaves, waterfall spray, spores,
// ash, fireflies...). Also handles the player's own effects (sprint dust, bubbles, splashes).
import * as THREE from '../lib/three.module.min.js';
import { BLOCKS, B } from './registry.js';
import { SOLID, OPAQUE } from './world.js';
import { biomeColors } from './worldgen.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = Math.random;
const C = (hex) => new THREE.Color(hex);
const SMOKE = [C(0x5a5a5a), C(0x6e6e6e), C(0x808080)];
const FLAME = [C(0xffd27a), C(0xffb040), C(0xff8a20)];
const SOUL = [C(0x9af6ff), C(0x40d8f0)];
const pick = (a) => a[(R() * a.length) | 0];
// torch wall offsets, same order as Redstone.torchAttach (meta 1..4)
const TORCH_ATT = [[0, 1], [-1, 0], [0, -1], [1, 0]];

export class Ambient {
  constructor(game) {
    this.game = game;
    this.handlers = new Array(BLOCKS.length).fill(null);
    this.leafTimer = 0;
    this.bubbleTimer = 0;
    this.sprintTimer = 0;
    this.wasInWater = false;
    this.buildHandlers();
  }

  get ps() { return this.game.particles; }

  smoke(x, y, z, n = 1, big = false) {
    for (let i = 0; i < n; i++) this.ps.spawn(x + (R() - 0.5) * 0.1, y, z + (R() - 0.5) * 0.1, pick(SMOKE), V((R() - 0.5) * 0.2, 0.6 + R() * 0.4, (R() - 0.5) * 0.2), 1.2 + R() * 0.8, big ? 0.1 : 0.06, -0.15, { drag: 0.6, grow: true, collide: false });
  }
  flame(x, y, z, soul = false) {
    this.ps.spawn(x + (R() - 0.5) * 0.04, y, z + (R() - 0.5) * 0.04, pick(soul ? SOUL : FLAME), V(0, 0.12, 0), 0.35 + R() * 0.25, 0.06, 0, { glow: true });
  }

  buildHandlers() {
    const H = this.handlers, set = (names, fn) => { for (const n of names) if (B[n] != null) H[B[n]] = fn; };
    const torch = (soul) => (x, y, z, m) => {
      let fx = x + 0.5, fy = y + 0.7, fz = z + 0.5;
      if (m) { const [ax, az] = TORCH_ATT[(m & 7) - 1] ?? [0, 0]; fx += ax * 0.4375; fz += az * 0.4375; fy = y + 0.92; }
      if (R() < 0.6) this.flame(fx, fy, fz, soul);
      if (R() < 0.35) this.smoke(fx, fy + 0.08, fz);
    };
    set(['torch'], torch(false));
    set(['soul_torch'], torch(true));
    set(['redstone_torch'], (x, y, z, m) => {
      let fx = x + 0.5, fy = y + 0.7, fz = z + 0.5;
      if (m) { const [ax, az] = TORCH_ATT[(m & 7) - 1] ?? [0, 0]; fx += ax * 0.4375; fz += az * 0.4375; fy = y + 0.92; }
      if (R() < 0.5) this.ps.spawn(fx + (R() - 0.5) * 0.15, fy, fz + (R() - 0.5) * 0.15, C(0xff2a10), V(0, 0.15, 0), 0.6, 0.05, 0, { glow: true });
    });
    set(['redstone_wire'], (x, y, z, m) => {
      if (m > 0 && R() < m / 30) this.ps.spawn(x + R(), y + 0.1, z + R(), new THREE.Color(0.3 + m / 21, 0, 0), V(0, 0.2, 0), 0.6, 0.04, 0, { glow: true });
    });
    set(['fire'], (x, y, z) => {
      const soul = [B.soul_sand, B.soul_soil].includes(this.game.world.getBlock(x, y - 1, z));
      if (R() < 0.7) this.smoke(x + 0.2 + R() * 0.6, y + 0.8 + R() * 0.4, z + 0.2 + R() * 0.6, 1, true);
      if (R() < 0.2) this.ps.spawn(x + R(), y + 0.5 + R() * 0.5, z + R(), soul ? SOUL[0] : FLAME[1], V((R() - 0.5) * 0.5, 1 + R(), (R() - 0.5) * 0.5), 0.8, 0.04, 0.5, { glow: true, drag: 0.5, collide: false });
      if (R() < 0.04) this.game.sfx('fire', x + 0.5, y + 0.5, z + 0.5);
    });
    set(['lava'], (x, y, z, m) => {
      const w = this.game.world;
      if (m !== 0 || w.getBlock(x, y + 1, z) !== 0) return;
      if (R() < 0.12) {
        // a popping ember arcs out of the lava
        this.ps.spawn(x + R(), y + 0.95, z + R(), C(0xffa030), V((R() - 0.5) * 2, 3 + R() * 2.5, (R() - 0.5) * 2), 1.2, 0.07, 9, { glow: true, shrink: false });
        if (R() < 0.2) this.game.sfx('lava_pop', x + 0.5, y + 1, z + 0.5);
      }
      if (R() < 0.05) this.smoke(x + R(), y + 1, z + R());
    });
    const furnace = (x, y, z) => {
      if (R() < 0.5) this.smoke(x + 0.3 + R() * 0.4, y + 1.05, z + 0.3 + R() * 0.4);
      if (R() < 0.35) {
        // flames licking out of the mouth: on whichever side faces open air
        const w = this.game.world;
        for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (SOLID[w.getBlock(x + dx, y, z + dz)]) continue;
          this.flame(x + 0.5 + dx * 0.52 + (dz ? (R() - 0.5) * 0.6 : 0), y + 0.15 + R() * 0.3, z + 0.5 + dz * 0.52 + (dx ? (R() - 0.5) * 0.6 : 0));
          break;
        }
      }
    };
    set(['lit_furnace', 'lit_smoker', 'lit_blast_furnace'], furnace);
    set(['nether_portal'], (x, y, z) => {
      for (let k = 0; k < 3; k++) {
        const px = x + R(), py = y + R(), pz = z + R();
        this.ps.spawn(px, py, pz, new THREE.Color().setHSL(0.76 + R() * 0.06, 0.9, 0.45 + R() * 0.25), V((R() - 0.5) * 1.5, (R() - 0.5) * 1.5, (R() - 0.5) * 1.5), 1 + R(), 0.05, 0, { glow: true, drag: 0.8 });
      }
      if (R() < 0.01) this.game.sfx('portal_hum', x + 0.5, y + 0.5, z + 0.5);
    });
    set(['end_portal'], (x, y, z) => { if (R() < 0.3) this.ps.spawn(x + R(), y + 0.8, z + R(), C(0x30204a), V(0, 0.3, 0), 1, 0.05, 0, { glow: true }); });
    set(['end_rod'], (x, y, z) => { if (R() < 0.8) this.ps.spawn(x + 0.5 + (R() - 0.5) * 0.3, y + 0.5 + (R() - 0.5) * 0.8, z + 0.5 + (R() - 0.5) * 0.3, C(0xfff8f0), V((R() - 0.5) * 0.3, -0.05 - R() * 0.1, (R() - 0.5) * 0.3), 2.5, 0.05, 0, { glow: true }); });
    set(['crying_obsidian'], (x, y, z) => {
      if (R() < 0.15 && !SOLID[this.game.world.getBlock(x, y - 1, z)]) this.ps.spawn(x + 0.15 + R() * 0.7, y - 0.05, z + 0.15 + R() * 0.7, C(0x8a2ad8), V(0, 0, 0), 2.5, 0.05, 6, { glow: true, shrink: false });
    });
    set(['spawner'], (x, y, z) => {
      if (R() < 0.5) this.flame(x + R(), y + R(), z + R());
      if (R() < 0.5) this.smoke(x + R(), y + R(), z + R());
    });
    set(['enchanting_table'], (x, y, z) => {
      // glyphs drift from nearby bookshelves into the book
      const w = this.game.world;
      for (let t = 0; t < 3; t++) {
        const dx = ((R() * 5) | 0) - 2, dz = ((R() * 5) | 0) - 2, dy = (R() * 2) | 0;
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
        if (w.getBlock(x + dx, y + dy, z + dz) !== B.bookshelf) continue;
        const sx = x + dx + 0.5, sy = y + dy + 1.2, sz = z + dz + 0.5, life = 1.6;
        this.ps.spawn(sx, sy, sz, new THREE.Color().setHSL(0.6 + R() * 0.1, 0.25, 0.85), V((x + 0.5 - sx) / life, (y + 1 - sy) / life, (z + 0.5 - sz) / life), life, 0.06, 0, { glow: true, collide: false, shrink: false });
      }
      if (R() < 0.15) this.ps.spawn(x + 0.5 + (R() - 0.5) * 0.6, y + 1.1, z + 0.5 + (R() - 0.5) * 0.6, C(0xd8e0ff), V(0, 0.3, 0), 0.8, 0.04, 0, { glow: true });
    });
    set(['brewing_stand'], (x, y, z) => { const t = this.game.world.tiles.get(`${x},${y},${z}`); if (t?.time > 0 && R() < 0.4) this.ps.spawn(x + 0.5 + (R() - 0.5) * 0.3, y + 0.7, z + 0.5 + (R() - 0.5) * 0.3, C(0xc0a0ff), V(0, 0.4, 0), 0.8, 0.04, 0, { glow: true }); });
    set(['mycelium'], (x, y, z) => { if (R() < 0.08 && !this.game.world.getBlock(x, y + 1, z)) this.ps.spawn(x + R(), y + 1.05, z + R(), C(0x9a8aa8), V(0, 0.05, 0), 2, 0.035, 0); });
    set(['amethyst_cluster', 'budding_amethyst'], (x, y, z) => { if (R() < 0.08) this.ps.spawn(x + 0.5 + (R() - 0.5) * 0.8, y + 0.5 + (R() - 0.5) * 0.8, z + 0.5 + (R() - 0.5) * 0.8, C(0xe0b0ff), V(0, 0.05, 0), 0.6, 0.04, 0, { glow: true }); });
    set(['sculk', 'sculk_sensor'], (x, y, z) => { if (R() < 0.03 && !this.game.world.getBlock(x, y + 1, z)) this.ps.spawn(x + R(), y + 1.02, z + R(), C(0x30b8c8), V(0, 0.2, 0), 1.2, 0.035, 0, { glow: true }); });
    const leaves = (x, y, z) => {
      const w = this.game.world;
      if (R() > 0.06 || w.getBlock(x, y - 1, z) !== 0) return;
      const id = w.getBlock(x, y, z), name = BLOCKS[id].name;
      let color;
      if (name === 'cherry_leaves') color = new THREE.Color().setHSL(0.93, 0.6, 0.78 + R() * 0.1);
      else if (name === 'spruce_leaves') color = C(0x619961);
      else if (name === 'birch_leaves') color = C(0x80a755);
      else color = new THREE.Color(biomeColors(w.biomeAt(x, z)).foliage).multiplyScalar(0.8 + R() * 0.3);
      // a leaf flutters down, swaying as it goes
      const sway = (R() - 0.5) * 1.2;
      this.ps.spawn(x + R(), y - 0.05, z + R(), color, V(sway, -0.35 - R() * 0.25, (R() - 0.5) * 0.6), 4 + R() * 3, 0.07, 0, { shrink: false });
    };
    for (const b of BLOCKS) if (b.name.endsWith('_leaves')) H[b.id] = leaves;
    if (B.cherry_leaves != null) H[B.cherry_leaves] = (x, y, z) => { leaves(x, y, z); leaves(x, y, z); leaves(x, y, z); };
    set(['water'], (x, y, z, m) => {
      // spray where a waterfall hits the ground or a pool
      const w = this.game.world;
      if (w.getBlock(x, y + 1, z) !== B.water) return;
      const below = w.getBlock(x, y - 1, z);
      if (below === B.water || !SOLID[below]) return;
      if (R() < 0.8) for (let i = 0; i < 2; i++) this.ps.spawn(x + R(), y + 0.15, z + R(), C(0xdcecff), V((R() - 0.5) * 2.5, 1.5 + R() * 1.5, (R() - 0.5) * 2.5), 0.5, 0.05, 9);
      if (R() < 0.02) this.game.sfx('splash', x + 0.5, y, z + 0.5);
    });
  }

  /** drips under blocks holding water or lava */
  drip(x, y, z) {
    const w = this.game.world;
    const up = w.getBlock(x, y + 1, z);
    if (up !== B.water && up !== B.lava) return;
    if (w.getBlock(x, y - 1, z) !== 0 || !OPAQUE[w.getBlock(x, y, z)]) return;
    if (R() > (up === B.lava ? 0.25 : 0.35)) return;
    this.ps.spawn(x + 0.15 + R() * 0.7, y - 0.03, z + 0.15 + R() * 0.7, up === B.lava ? C(0xff7a10) : C(0x4a78e8), V(0, -0.2, 0), 3, 0.05, 7, { glow: up === B.lava, shrink: false });
  }

  /** air particles that depend on the biome (nether spores, ash, fireflies, underwater motes) */
  airMotes(dt) {
    const g = this.game, w = g.world, p = g.player;
    const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
    const biome = w.biomeAt(bx, bz);
    const n = Math.ceil(dt * 60);
    for (let i = 0; i < n; i++) {
      const x = p.pos.x + (R() - 0.5) * 24, y = p.pos.y + (R() - 0.3) * 12, z = p.pos.z + (R() - 0.5) * 24;
      const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (p.headInWater) {
        if (id === B.water && R() < 0.5) this.ps.spawn(x, y, z, C(0x8ab0c8), V((R() - 0.5) * 0.1, (R() - 0.5) * 0.1, (R() - 0.5) * 0.1), 3, 0.025, 0, { collide: false });
        continue;
      }
      if (id !== 0) continue;
      if (g.dim === 'nether') {
        if (biome === 22 && R() < 0.5) this.ps.spawn(x, y, z, C(0xc83030), V((R() - 0.5) * 0.3, -0.15, (R() - 0.5) * 0.3), 5, 0.035, 0, { glow: true, collide: false });
        else if (biome === 23 && R() < 0.5) this.ps.spawn(x, y, z, C(0x30d8c0), V((R() - 0.5) * 0.3, 0.12, (R() - 0.5) * 0.3), 5, 0.035, 0, { glow: true, collide: false });
        else if (biome === 24 && R() < 0.3) this.ps.spawn(x, y, z, C(0x6a8aa0), V(0.2, -0.1, 0.1), 6, 0.04, 0, { collide: false });
        else if (biome === 25 && R() < 0.6) this.ps.spawn(x, y, z, C(0xe8e8e8), V(0.15 + R() * 0.2, -0.3, (R() - 0.5) * 0.3), 6, 0.03, 0, { glow: true, collide: false });
        else if (R() < 0.05) this.ps.spawn(x, y, z, C(0xb05020), V(0, -0.1, 0), 4, 0.025, 0, { glow: true, collide: false });
      } else if (g.dim === 'end') {
        if (R() < 0.08) this.ps.spawn(x, y, z, C(0x8a70a8), V(0, 0.05, 0), 4, 0.025, 0, { glow: true, collide: false });
      } else if (w.hasSky && g.daylightLevel < 0.35 && (biome === 11 || biome === 18 || biome === 14) && R() < 0.12) {
        // fireflies over swamps and dark forests at night
        const gy = Math.floor(y);
        if (SOLID[w.getBlock(Math.floor(x), gy - 1, Math.floor(z))] || SOLID[w.getBlock(Math.floor(x), gy - 2, Math.floor(z))]) this.ps.spawn(x, y, z, C(0xd8ff60), V((R() - 0.5) * 0.6, (R() - 0.5) * 0.3, (R() - 0.5) * 0.6), 2.5 + R() * 2, 0.05, 0, { glow: true, collide: false, drag: 0.2 });
      }
    }
  }

  /** particles caused by the player: sprint dust, bubbles, water splashes */
  playerEffects(dt) {
    const g = this.game, p = g.player, w = g.world;
    const below = w.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.2), Math.floor(p.pos.z));
    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (p.onGround && speed > 5 && !p.inWater && BLOCKS[below]?.solid) {
      this.sprintTimer -= dt;
      if (this.sprintTimer <= 0) { this.sprintTimer = 0.05; this.ps.dust(p.pos.x, p.pos.y, p.pos.z, below, 1, 0.25, 0.8); }
    }
    if (p.headInWater) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.bubbleTimer = 0.4 + R() * 1.2;
        const e = p.eyePos(), d = p.lookDir();
        for (let i = 0; i < 1 + ((R() * 3) | 0); i++) this.ps.spawn(e.x + d.x * 0.4 + (R() - 0.5) * 0.2, e.y - 0.1, e.z + d.z * 0.4 + (R() - 0.5) * 0.2, C(0xd8ecff), V((R() - 0.5) * 0.2, 1.2 + R() * 0.6, (R() - 0.5) * 0.2), 1.5, 0.05, 0, { glow: true });
      }
    }
    if (p.inWater && !this.wasInWater && p.vel.y < -4) {
      // hit the water: spray ring and bubbles
      for (let i = 0; i < 30; i++) { const a = R() * Math.PI * 2, s = 1.5 + R() * 2.5; this.ps.spawn(p.pos.x + Math.cos(a) * 0.4, Math.floor(p.pos.y) + 1, p.pos.z + Math.sin(a) * 0.4, C(0xdcecff), V(Math.cos(a) * s, 2 + R() * 3, Math.sin(a) * s), 0.7, 0.06, 10); }
      for (let i = 0; i < 12; i++) this.ps.spawn(p.pos.x + (R() - 0.5), p.pos.y + R(), p.pos.z + (R() - 0.5), C(0xd8ecff), V(0, 1 + R(), 0), 1, 0.05, 0, { glow: true });
      g.sfx('splash');
    }
    this.wasInWater = p.inWater;
  }

  update(dt) {
    const g = this.game, w = g.world, p = g.player;
    if (!w || !p || g.options.particles === false) return;
    const px = Math.floor(p.pos.x), py = Math.floor(p.pos.y), pz = Math.floor(p.pos.z);
    // sample random blocks around the player, denser close by
    const samples = Math.min(this.game.touch ? 600 : 1500, Math.ceil(dt * (this.game.touch ? 8000 : 16000)));
    for (let i = 0; i < samples; i++) {
      const r = i % 3 === 0 ? 16 : 9;
      const x = px + ((R() * r * 2) | 0) - r, y = py + ((R() * r * 2) | 0) - r, z = pz + ((R() * r * 2) | 0) - r;
      if (y < 0 || y > 127) continue;
      const id = w.getBlock(x, y, z);
      if (!id) continue;
      const h = this.handlers[id];
      if (h) h(x, y, z, w.getMeta(x, y, z));
      if (OPAQUE[id]) this.drip(x, y, z);
    }
    this.airMotes(dt);
    this.playerEffects(dt);
  }
}
