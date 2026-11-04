// Redstone simulation: power sources, wires (0-15), inverting torches, repeaters with delay,
// comparators (compare/subtract), lamps, pistons, observers, dispensers/droppers, hoppers,
// note blocks, TNT and doors. Recomputed on demand each tick when something changed.
import { B, BLOCKS, ITEMS, I } from './registry.js';

const DIRS6 = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]; // meta6: down up north south west east
const H4 = [[0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 0]];                         // meta4 facing: S W N E (front faces player)
const key = (x, y, z) => `${x},${y},${z}`;
const IMMOVABLE = new Set();
export const REDSTONE_NAMES = new Set(['redstone_wire', 'redstone_torch', 'unlit_redstone_torch', 'lever', 'stone_button', 'oak_button', 'stone_pressure_plate', 'oak_pressure_plate',
  'repeater', 'powered_repeater', 'comparator', 'redstone_lamp', 'lit_redstone_lamp', 'piston', 'sticky_piston', 'piston_head', 'observer', 'dispenser', 'dropper', 'hopper',
  'note_block', 'redstone_block', 'daylight_detector', 'tnt', 'oak_door', 'target', 'powered_rail', 'detector_rail', 'activator_rail', 'iron_door']);

export class Redstone {
  constructor(game) {
    this.game = game;
    this.positions = new Set();   // all redstone-relevant blocks in loaded chunks
    this.dirty = true;
    this.scheduled = [];          // {t, x, y, z, fn}
    this.wire = new Map();        // key -> power
    this.powered = new Map();     // key of block -> {strong, weak}
    this.prevPowered = new Map(); // components previous state (for rising edges)
    this.torchBurn = new Map();
    for (const n of ['obsidian', 'crying_obsidian', 'bedrock', 'end_portal_frame', 'end_portal_frame_eye', 'end_portal', 'nether_portal', 'chest', 'furnace', 'lit_furnace', 'barrel', 'brewing_stand', 'enchanting_table', 'spawner', 'hopper', 'dispenser', 'dropper', 'beacon', 'lit_smoker', 'smoker', 'blast_furnace', 'lit_blast_furnace', 'bed', 'oak_door', 'iron_door', 'piston_head']) if (B[n] != null) IMMOVABLE.add(B[n]);
  }
  get world() { return this.game.world; }
  isRS(id) { return REDSTONE_NAMES.has(BLOCKS[id]?.name); }
  track(x, y, z, id) { if (this.isRS(id)) this.positions.add(key(x, y, z)); }
  onBlockChanged(x, y, z, oldId, newId) {
    if (this.isRS(oldId) || this.isRS(newId)) { if (this.isRS(newId)) this.positions.add(key(x, y, z)); this.dirty = true; }
    // observers notice any change in front of them
    for (const [dx, dy, dz] of DIRS6) {
      const ox = x - dx, oy = y - dy, oz = z - dz;
      if (this.world.getBlock(ox, oy, oz) === B.observer) {
        const m = this.world.getMeta(ox, oy, oz) & 7;
        const f = DIRS6[m];
        if (ox + f[0] === x && oy + f[1] === y && oz + f[2] === z) this.pulseObserver(ox, oy, oz);
      }
    }
    // neighbours of solid blocks can change (weak power through blocks)
    if (this.positions.size) this.dirty = true;
  }
  scanChunk(c, CS) {
    for (let i = 0; i < c.data.length; i++) if (this.isRS(c.data[i])) this.positions.add(key((i & 15) + c.cx * CS, i >> 8, ((i >> 4) & 15) + c.cz * CS));
  }
  schedule(delayTicks, fn) { this.scheduled.push({ t: this.game.world.tickCount + delayTicks, fn }); }

  // ------------------------------------------------------------ sources
  // returns power a block emits *into* neighbour (nx,ny,nz) directly (not through solid blocks)
  directPower(x, y, z, id, meta, nx, ny, nz) {
    const n = BLOCKS[id].name;
    if (n === 'redstone_block') return 15;
    if (n === 'redstone_torch') { const att = this.torchAttach(x, y, z, meta); return (att[0] === nx && att[1] === ny && att[2] === nz) ? 0 : 15; }
    if (n === 'lever') return meta & 8 ? 15 : 0;
    if (n === 'stone_button' || n === 'oak_button') return meta & 8 ? 15 : 0;
    if (n === 'stone_pressure_plate' || n === 'oak_pressure_plate') return meta & 8 ? 15 : 0;
    if (n === 'detector_rail') return meta & 8 ? 15 : 0;
    if (n === 'daylight_detector') return meta & 15;
    if (n === 'observer') { if (!(meta & 8)) return 0; const f = DIRS6[meta & 7]; return (x - f[0] === nx && y - f[1] === ny && z - f[2] === nz) ? 15 : 0; }
    if (n === 'powered_repeater' || n === 'comparator') {
      const f = H4[(meta & 3)]; // output toward the side opposite the player-facing front (signal flows away from player)
      const ox = x - f[0], oz = z - f[2];
      if (ox !== nx || y !== ny || oz !== nz) return 0;
      return n === 'comparator' ? (this.compOut.get(key(x, y, z)) ?? 0) : 15;
    }
    return 0;
  }
  // which neighbour a lever/button/torch is attached to (that block gets strongly powered)
  torchAttach(x, y, z, meta) {
    if (!meta) return [x, y - 1, z];
    const [ax, az] = [[0, 1], [-1, 0], [0, -1], [1, 0]][(meta & 7) - 1] ?? [0, 0];
    return [x + ax, y, z + az];
  }
  attachOf(x, y, z, id, meta) {
    const n = BLOCKS[id].name;
    if (n === 'lever' || n.endsWith('_button')) { const a = (meta & 7); return a === 0 ? [x, y - 1, z] : a === 5 ? [x, y + 1, z] : this.torchAttach(x, y, z, a); }
    if (n.endsWith('_pressure_plate')) return [x, y - 1, z];
    if (n === 'redstone_torch') return [x, y + 1, z]; // torches strongly power the block above
    return null;
  }

  // ------------------------------------------------------------ main recompute
  update() {
    const w = this.world;
    // scheduled delayed actions (torches, repeaters, buttons)
    if (this.scheduled.length) {
      const now = w.tickCount;
      const due = this.scheduled.filter((s) => s.t <= now);
      this.scheduled = this.scheduled.filter((s) => s.t > now);
      for (const s of due) s.fn();
      if (due.length) this.dirty = true;
    }
    this.tickPlates();
    if (w.tickCount % 20 === 0) this.tickDaylight();
    if (w.tickCount % 8 === 0) this.tickHoppers();
    if (!this.dirty) return;
    this.dirty = false;
    const list = [];
    for (const k of this.positions) {
      const [x, y, z] = k.split(',').map(Number);
      const id = w.getBlock(x, y, z);
      if (!this.isRS(id)) { this.positions.delete(k); continue; }
      list.push([x, y, z, id, w.getMeta(x, y, z)]);
    }
    this.compOut ??= new Map();
    // 1) strong power into solid blocks from attached sources / torches above / repeater outputs
    const strong = new Map();
    const addStrong = (x, y, z, p) => { const k = key(x, y, z); if (OPAQ(w.getBlock(x, y, z))) strong.set(k, Math.max(strong.get(k) ?? 0, p)); };
    for (const [x, y, z, id, m] of list) {
      const n = BLOCKS[id].name;
      const on = n === 'redstone_torch' || n === 'redstone_block' || ((n === 'lever' || n.endsWith('_button') || n.endsWith('_pressure_plate')) && (m & 8));
      if (on && n !== 'redstone_block') { const a = this.attachOf(x, y, z, id, m); if (a) addStrong(a[0], a[1], a[2], 15); }
      if (n === 'powered_repeater' || (n === 'comparator' && (this.compOut.get(key(x, y, z)) ?? 0) > 0)) { const f = H4[m & 3]; addStrong(x - f[0], y, z - f[2], n === 'comparator' ? this.compOut.get(key(x, y, z)) : 15); }
      if (n === 'observer' && (m & 8)) { const f = DIRS6[m & 7]; addStrong(x - f[0], y - f[1], z - f[2], 15); }
    }
    // 2) wires: BFS from neighbours that provide power
    const wires = list.filter((e) => e[3] === B.redstone_wire);
    const level = new Map();
    const queue = [];
    const sourceInto = (x, y, z) => {
      let best = 0;
      for (const [dx, dy, dz] of DIRS6) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const nid = w.getBlock(nx, ny, nz);
        if (!nid) continue;
        if (this.isRS(nid) && nid !== B.redstone_wire) best = Math.max(best, this.directPower(nx, ny, nz, nid, w.getMeta(nx, ny, nz), x, y, z));
        else if (OPAQ(nid)) best = Math.max(best, strong.get(key(nx, ny, nz)) ?? 0);
      }
      return best;
    };
    for (const [x, y, z] of wires) {
      const p = sourceInto(x, y, z);
      if (p > 0) { level.set(key(x, y, z), p); queue.push([x, y, z, p]); }
    }
    const wireNeighbours = (x, y, z) => {
      const out = [];
      for (const [dx, , dz] of H4) {
        const nx = x + dx, nz = z + dz;
        if (w.getBlock(nx, y, nz) === B.redstone_wire) out.push([nx, y, nz]);
        if (!OPAQ(w.getBlock(x, y + 1, z)) && w.getBlock(nx, y + 1, nz) === B.redstone_wire && OPAQ(w.getBlock(nx, y, nz))) out.push([nx, y + 1, nz]);
        if (!OPAQ(w.getBlock(nx, y, nz)) && w.getBlock(nx, y - 1, nz) === B.redstone_wire) out.push([nx, y - 1, nz]);
      }
      return out;
    };
    while (queue.length) {
      const [x, y, z, p] = queue.shift();
      if (p <= 1) continue;
      for (const [nx, ny, nz] of wireNeighbours(x, y, z)) {
        const k = key(nx, ny, nz);
        if ((level.get(k) ?? 0) < p - 1) { level.set(k, p - 1); queue.push([nx, ny, nz, p - 1]); }
      }
    }
    for (const [x, y, z, , m] of wires) {
      const p = level.get(key(x, y, z)) ?? 0;
      if ((m & 15) !== p) w.setBlock(x, y, z, B.redstone_wire, p, { noUpdate: true, redstone: true });
    }
    this.wire = level;
    // 3) weak power: blocks under / beside powered wire
    const weak = new Map();
    for (const [x, y, z] of wires) {
      const p = level.get(key(x, y, z)) ?? 0;
      if (!p) continue;
      for (const [dx, dy, dz] of [[0, -1, 0], ...H4]) { const k = key(x + dx, y + dy, z + dz); if (OPAQ(w.getBlock(x + dx, y + dy, z + dz))) weak.set(k, Math.max(weak.get(k) ?? 0, p)); }
    }
    this.strong = strong; this.weak = weak;
    // 4) components
    for (const [x, y, z, id, m] of list) this.evalComponent(x, y, z, id, m);
  }

  // power level arriving at (x,y,z) from any side (used by lamps, pistons, doors, TNT...)
  powerAt(x, y, z, except = null) {
    const w = this.world;
    let best = 0;
    for (const [dx, dy, dz] of DIRS6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (except && except[0] === nx && except[1] === ny && except[2] === nz) continue;
      const nid = w.getBlock(nx, ny, nz);
      if (!nid) continue;
      const k = key(nx, ny, nz);
      if (nid === B.redstone_wire) best = Math.max(best, this.wire.get(k) ?? 0);
      else if (this.isRS(nid)) best = Math.max(best, this.directPower(nx, ny, nz, nid, w.getMeta(nx, ny, nz), x, y, z));
      else if (OPAQ(nid)) best = Math.max(best, this.strong?.get(k) ?? 0, this.weak?.get(k) ?? 0);
    }
    return best;
  }
  // input into a directional component from behind
  inputBehind(x, y, z, m) {
    const f = H4[m & 3];
    const bx = x + f[0], bz = z + f[2];
    const w = this.world;
    const nid = w.getBlock(bx, y, bz);
    const k = key(bx, y, bz);
    if (nid === B.redstone_wire) return this.wire.get(k) ?? 0;
    if (this.isRS(nid)) return this.directPower(bx, y, bz, nid, w.getMeta(bx, y, bz), x, y, z);
    if (OPAQ(nid)) return Math.max(this.strong?.get(k) ?? 0, this.weak?.get(k) ?? 0, this.containerSignal(bx, y, bz));
    return this.containerSignal(bx, y, bz);
  }
  containerSignal(x, y, z) {
    const t = this.world.tiles.get(key(x, y, z));
    if (!t?.items) return 0;
    let fill = 0;
    for (const s of t.items) if (s) fill += s.count / (ITEMS[s.id]?.stack ?? 64);
    return fill ? Math.floor(1 + (fill / t.items.length) * 14) : 0;
  }

  evalComponent(x, y, z, id, m) {
    const w = this.world, g = this.game;
    const n = BLOCKS[id].name;
    const k = key(x, y, z);
    const set = (nid, nm) => w.setBlock(x, y, z, nid, nm, { noUpdate: true, keepTile: true, redstone: true });
    if (n === 'redstone_lamp' || n === 'lit_redstone_lamp') {
      const p = this.powerAt(x, y, z) > 0;
      if (p && n === 'redstone_lamp') set(B.lit_redstone_lamp, 0);
      else if (!p && n === 'lit_redstone_lamp') this.schedule(2, () => { if (w.getBlock(x, y, z) === B.lit_redstone_lamp && !(this.powerAt(x, y, z) > 0)) set(B.redstone_lamp, 0); });
    } else if (n === 'redstone_torch' || n === 'unlit_redstone_torch') {
      // inverter: off when the block it is attached to is powered
      const a = this.torchAttach(x, y, z, m);
      const ak = key(...a);
      const inPow = (this.strong.get(ak) ?? 0) > 0 || (this.weak.get(ak) ?? 0) > 0;
      const want = inPow ? B.unlit_redstone_torch : B.redstone_torch;
      if (want !== id && !this.pending?.has(k)) {
        (this.pending ??= new Set()).add(k);
        this.schedule(2, () => {
          this.pending.delete(k);
          if (w.getBlock(x, y, z) !== id) return;
          // burnout protection against very fast clocks
          const hist = (this.torchBurn.get(k) ?? []).filter((t) => w.tickCount - t < 60);
          hist.push(w.tickCount); this.torchBurn.set(k, hist);
          if (hist.length > 10 && want === B.redstone_torch) { this.schedule(60, () => { this.dirty = true; }); return; }
          set(want, m);
        });
      }
    } else if (n === 'repeater' || n === 'powered_repeater') {
      const inP = this.inputBehind(x, y, z, m) > 0;
      const delay = 2 * (((m >> 2) & 3) + 1);
      if (inP && n === 'repeater' && !this.pending?.has(k)) { (this.pending ??= new Set()).add(k); this.schedule(delay, () => { this.pending.delete(k); if (w.getBlock(x, y, z) === B.repeater) set(B.powered_repeater, w.getMeta(x, y, z)); }); }
      if (!inP && n === 'powered_repeater' && !this.pending?.has(k)) { (this.pending ??= new Set()).add(k); this.schedule(delay, () => { this.pending.delete(k); if (w.getBlock(x, y, z) === B.powered_repeater && !(this.inputBehind(x, y, z, w.getMeta(x, y, z)) > 0)) set(B.repeater, w.getMeta(x, y, z)); }); }
    } else if (n === 'comparator') {
      const rear = this.inputBehind(x, y, z, m);
      const f = H4[m & 3];
      const sideA = this.sideInput(x - f[2] * 0 + (f[2] ? 1 : 0), y, z + (f[0] ? 1 : 0)), sideB = this.sideInput(x - (f[2] ? 1 : 0), y, z - (f[0] ? 1 : 0));
      const side = Math.max(sideA, sideB);
      const out = m & 4 ? Math.max(0, rear - side) : (rear >= side ? rear : 0);
      if ((this.compOut.get(k) ?? 0) !== out) { this.compOut.set(k, out); this.schedule(2, () => { this.dirty = true; }); }
    } else if (n === 'piston' || n === 'sticky_piston') {
      const p = this.powerAt(x, y, z, null) > 0;
      const ext = !!(m & 8);
      if (p && !ext) this.extend(x, y, z, id, m);
      else if (!p && ext) this.retract(x, y, z, id, m);
    } else if (n === 'note_block') {
      const p = this.powerAt(x, y, z) > 0;
      if (p && !this.prevPowered.get(k)) g.playNote?.(x, y, z, m);
      this.prevPowered.set(k, p);
    } else if (n === 'tnt') {
      if (this.powerAt(x, y, z) > 0) g.igniteTNT?.(x, y, z);
    } else if (n === 'oak_door' || n === 'iron_door') {
      if (m & 4) return; // top half follows bottom
      const p = this.powerAt(x, y, z) > 0 || this.powerAt(x, y + 1, z) > 0;
      const open = !!(m & 8);
      if (p !== open) g.toggleDoor?.(x, y, z, p);
    } else if (n === 'dispenser' || n === 'dropper') {
      const p = this.powerAt(x, y, z) > 0;
      if (p && !this.prevPowered.get(k)) this.schedule(4, () => g.dispense?.(x, y, z, n === 'dropper'));
      this.prevPowered.set(k, p);
    } else if (n === 'powered_rail' || n === 'activator_rail') {
      const p = this.powerAt(x, y, z) > 0 || this.powerAt(x, y - 1, z) > 0;
      const on = !!(m & 8);
      if (p !== on) set(id, p ? m | 8 : m & 7);
    } else if (n === 'hopper') {
      const locked = this.powerAt(x, y, z) > 0;
      const t = w.tiles.get(k);
      if (t) t.locked = locked;
    }
  }
  // tile entity of a container block (created on demand, like when it is opened)
  containerAt(x, y, z) {
    const n = BLOCKS[this.world.getBlock(x, y, z)]?.name;
    const type = { chest: 'chest', barrel: 'chest', hopper: 'hopper', dispenser: 'dispenser', dropper: 'dispenser', furnace: 'furnace', lit_furnace: 'furnace', smoker: 'furnace', lit_smoker: 'furnace', blast_furnace: 'furnace', lit_blast_furnace: 'furnace', brewing_stand: 'brewing' }[n];
    return type ? this.game.getTile(x, y, z, type) : null;
  }
  sideInput(x, y, z) {
    const w = this.world;
    const nid = w.getBlock(x, y, z);
    if (nid === B.redstone_wire) return this.wire.get(key(x, y, z)) ?? 0;
    if (nid === B.powered_repeater || nid === B.redstone_block) return 15;
    return 0;
  }

  // ------------------------------------------------------------ pistons
  extend(x, y, z, id, m) {
    const w = this.world;
    const [dx, dy, dz] = DIRS6[m & 7];
    const line = [];
    let cx = x + dx, cy = y + dy, cz = z + dz;
    for (let i = 0; i <= 12; i++) {
      const bid = w.getBlock(cx, cy, cz);
      if (!bid || BLOCKS[bid].replaceable) break;
      if (IMMOVABLE.has(bid) || BLOCKS[bid].hardness < 0 || ((bid === B.piston || bid === B.sticky_piston) && (w.getMeta(cx, cy, cz) & 8))) return;
      if (i === 12) return;
      line.push([cx, cy, cz, bid, w.getMeta(cx, cy, cz)]);
      cx += dx; cy += dy; cz += dz;
    }
    if (cy < 0 || cy >= 128) return;
    const endId = w.getBlock(cx, cy, cz);
    if (endId && BLOCKS[endId].replaceable && endId !== 0) this.game.dropBlockItems(cx, cy, cz, endId);
    for (let i = line.length - 1; i >= 0; i--) {
      const [bx, by, bz, bid, bm] = line[i];
      w.setBlock(bx + dx, by + dy, bz + dz, bid, bm, { noUpdate: true });
    }
    w.setBlock(x + dx, y + dy, z + dz, B.piston_head, (m & 7) | (id === B.sticky_piston ? 8 : 0), { noUpdate: true });
    w.setBlock(x, y, z, id, m | 8, { noUpdate: true, redstone: true });
    // push entities in the way
    for (const e of [this.game.player, ...this.game.entities]) {
      if (!e?.pos) continue;
      for (let i = 0; i <= line.length; i++) {
        const bx = x + dx * (i + 1), by = y + dy * (i + 1), bz = z + dz * (i + 1);
        if (e.pos.x > bx - 0.3 && e.pos.x < bx + 1.3 && e.pos.y > by - 1.8 && e.pos.y < by + 1 && e.pos.z > bz - 0.3 && e.pos.z < bz + 1.3) { e.pos.x += dx; e.pos.y += dy + (dy > 0 ? 0.05 : 0); e.pos.z += dz; break; }
      }
    }
    for (const [bx, by, bz] of line) w.neighborUpdate(bx + dx, by + dy, bz + dz);
    this.game.sfx('piston');
  }
  retract(x, y, z, id, m) {
    const w = this.world;
    const [dx, dy, dz] = DIRS6[m & 7];
    const hx = x + dx, hy = y + dy, hz = z + dz;
    if (w.getBlock(hx, hy, hz) === B.piston_head) w.setBlock(hx, hy, hz, 0, 0, { noUpdate: true });
    w.setBlock(x, y, z, id, m & 7, { noUpdate: true, redstone: true });
    if (id === B.sticky_piston) {
      const px = hx + dx, py = hy + dy, pz = hz + dz;
      const bid = w.getBlock(px, py, pz);
      if (bid && !IMMOVABLE.has(bid) && BLOCKS[bid].hardness >= 0 && !BLOCKS[bid].replaceable && !(bid === B.piston || bid === B.sticky_piston)) {
        w.setBlock(hx, hy, hz, bid, w.getMeta(px, py, pz), { noUpdate: true });
        w.setBlock(px, py, pz, 0, 0, { noUpdate: true });
      }
    }
    w.neighborUpdate(hx, hy, hz);
    this.game.sfx('piston');
  }

  // ------------------------------------------------------------ helpers ticking
  pulseObserver(x, y, z) {
    const w = this.world;
    if (w.getMeta(x, y, z) & 8) return;
    this.schedule(2, () => {
      if (w.getBlock(x, y, z) !== B.observer) return;
      w.setBlock(x, y, z, B.observer, w.getMeta(x, y, z) | 8, { noUpdate: true, redstone: true });
      this.dirty = true;
      this.schedule(2, () => { if (w.getBlock(x, y, z) === B.observer) w.setBlock(x, y, z, B.observer, w.getMeta(x, y, z) & 7, { noUpdate: true, redstone: true }); this.dirty = true; });
    });
  }
  tickPlates() {
    const w = this.world, g = this.game;
    if (w.tickCount % 4) return;
    for (const k of this.positions) {
      const [x, y, z] = k.split(',').map(Number);
      const id = w.getBlock(x, y, z);
      const n = BLOCKS[id]?.name;
      if (!(n?.endsWith('_pressure_plate') || n === 'detector_rail')) continue;
      const wood = n === 'oak_pressure_plate' || n === 'detector_rail';
      const ents = [g.player, ...g.entities.filter((e) => wood || e.type)];
      const pressed = ents.some((e) => e?.pos && !e.dead && e.pos.x > x - 0.05 && e.pos.x < x + 1.05 && e.pos.z > z - 0.05 && e.pos.z < z + 1.05 && e.pos.y >= y - 0.1 && e.pos.y < y + 0.6 && (e !== g.player || g.player.mode !== 'spectator'));
      const m = w.getMeta(x, y, z);
      if (pressed !== !!(m & 8)) { w.setBlock(x, y, z, id, pressed ? m | 8 : m & 7, { noUpdate: true, redstone: true }); g.sfx('click'); this.dirty = true; }
    }
  }
  tickDaylight() {
    const w = this.world, g = this.game;
    for (const k of this.positions) {
      const [x, y, z] = k.split(',').map(Number);
      if (w.getBlock(x, y, z) !== B.daylight_detector) continue;
      const sky = w.getLight(x, y + 1, z) >> 4;
      const p = Math.round(sky * Math.max(0, g.daylightLevel - 0.2) / 0.8);
      if ((w.getMeta(x, y, z) & 15) !== p) { w.setBlock(x, y, z, B.daylight_detector, p, { noUpdate: true, redstone: true }); this.dirty = true; }
    }
  }
  tickHoppers() {
    const w = this.world, g = this.game;
    for (const k of this.positions) {
      const [x, y, z] = k.split(',').map(Number);
      if (w.getBlock(x, y, z) !== B.hopper) continue;
      const t = g.getTile(x, y, z, 'hopper');
      if (t.locked) continue;
      // pull from container above, or pick up dropped items
      const above = this.containerAt(x, y + 1, z);
      if (above?.items) {
        const src = above.type === 'furnace' ? [2] : above.items.map((_, i) => i);
        for (const i of src) { const s = above.items[i]; if (s && insert(t.items, s, 1)) { s.count--; if (s.count <= 0) above.items[i] = null; break; } }
      } else {
        for (const e of g.entities) if (e.stack && !e.remove && Math.abs(e.pos.x - x - 0.5) < 0.8 && Math.abs(e.pos.z - z - 0.5) < 0.8 && e.pos.y >= y + 0.5 && e.pos.y < y + 1.8) { const n = insertAll(t.items, e.stack); if (n >= e.stack.count) e.remove = true; else e.stack.count -= n; }
      }
      // push into the container it points to (meta 0 = down, else side)
      const m = w.getMeta(x, y, z);
      const [dx, dy, dz] = m === 0 ? [0, -1, 0] : H4[(m - 1) & 3];
      const dest = this.containerAt(x + dx, y + dy, z + dz);
      if (dest?.items) {
        for (let i = 0; i < t.items.length; i++) {
          const s = t.items[i]; if (!s) continue;
          let slots = dest.items.map((_, j) => j);
          if (dest.type === 'furnace') slots = dy < 0 ? [0] : [1];
          if (dest.type === 'brewing') slots = dy < 0 ? [3] : [0, 1, 2, 4];
          if (insert(dest.items, s, 1, slots)) { s.count--; if (s.count <= 0) t.items[i] = null; break; }
        }
      }
    }
  }
}
function OPAQ(id) { return !!id && BLOCKS[id]?.opaque && BLOCKS[id].render === 'cube'; }
function insert(items, s, n, slots = items.map((_, i) => i)) {
  for (const i of slots) { const d = items[i]; if (d && d.id === s.id && !d.dmg && !s.dmg && JSON.stringify(d.data ?? null) === JSON.stringify(s.data ?? null) && d.count + n <= (ITEMS[s.id]?.stack ?? 64)) { d.count += n; return true; } }
  for (const i of slots) if (!items[i]) { items[i] = { ...s, count: n }; return true; }
  return false;
}
function insertAll(items, s) { let k = 0; while (k < s.count && insert(items, s, 1)) k++; return k; }
export { DIRS6, H4 };
void I;
