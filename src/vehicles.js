// Vehicles (boats, minecarts on rails), the fishing bobber and rail shapes.
import * as THREE from '../lib/three.module.min.js';
import { B, BLOCKS, I, ITEMS } from './registry.js';
import { Entity } from './entities.js';
import { moveEntity } from './physics.js';
import { enchLevel } from './enchant.js';

// rail meta: 0 N-S, 1 E-W, 2 up east, 3 up west, 4 up north, 5 up south, 6 S-E, 7 S-W, 8 N-W, 9 N-E
// each entry: two exits as [dx, dz, dy]
export const RAIL_DIRS = [
  [[0, -1, 0], [0, 1, 0]], [[-1, 0, 0], [1, 0, 0]],
  [[-1, 0, 0], [1, 0, 1]], [[-1, 0, 1], [1, 0, 0]], [[0, -1, 1], [0, 1, 0]], [[0, -1, 0], [0, 1, 1]],
  [[0, 1, 0], [1, 0, 0]], [[0, 1, 0], [-1, 0, 0]], [[0, -1, 0], [-1, 0, 0]], [[0, -1, 0], [1, 0, 0]],
];
export const isRail = (id) => id === B.rail || id === B.powered_rail || id === B.detector_rail || id === B.activator_rail;

// choose a rail shape from neighbouring rails
export function shapeRail(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  if (!isRail(id)) return;
  const straightOnly = id !== B.rail;
  const conn = [];
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (isRail(world.getBlock(x + dx, y, z + dz))) conn.push([dx, dz, 0]);
    else if (isRail(world.getBlock(x + dx, y + 1, z + dz))) conn.push([dx, dz, 1]);
    else if (isRail(world.getBlock(x + dx, y - 1, z + dz))) conn.push([dx, dz, 0]);
  }
  let meta = world.getMeta(x, y, z) & 7;
  const pick = (a, b) => {
    for (let m = 0; m < (straightOnly ? 6 : 10); m++) {
      const [e1, e2] = RAIL_DIRS[m];
      const has = (c) => (e1[0] === c[0] && e1[1] === c[1] && e1[2] === c[2]) || (e2[0] === c[0] && e2[1] === c[1] && e2[2] === c[2]);
      if (has(a) && (!b || has(b))) return m;
    }
    return -1;
  };
  if (conn.length >= 2) { const m = pick(conn[0], conn[1]); if (m >= 0) meta = m; else { const m2 = pick(conn[0]); if (m2 >= 0) meta = m2; } }
  else if (conn.length === 1) { const m = pick(conn[0]); if (m >= 0) meta = m; }
  const old = world.getMeta(x, y, z);
  const nm = straightOnly ? (meta | (old & 8)) : meta;
  if (nm !== old) world.setBlock(x, y, z, id, nm, { noUpdate: true });
}

// ---------------------------------------------------------------- shared vehicle base
class Vehicle extends Entity {
  constructor(game, x, y, z) { super(game, x, y, z); this.isVehicle = true; this.rider = null; this.damage = 0; this.hurtTime = 0; }
  hurt(amount, source) {
    if (this.remove) return false;
    this.damage += amount * 10; this.hurtTime = 0.3;
    this.game.sfx('dig:wood');
    if (this.damage > 40 || source === this.game.player && this.game.player.mode === 'creative') {
      this.remove = true; this.dead = true;
      if (this.rider) this.rider.dismount();
      if (this.game.player.mode !== 'creative') this.game.spawnItem(this.pos.x, this.pos.y + 0.5, this.pos.z, { id: this.itemId(), count: 1 });
    }
    return true;
  }
  seat() { return this.pos.clone().add(new THREE.Vector3(0, this.seatY ?? 0.2, 0)); }
}

// ---------------------------------------------------------------- boat
export class Boat extends Vehicle {
  constructor(game, x, y, z, wood = 'oak') {
    super(game, x, y, z);
    this.wood = wood;
    this.w = 1.375; this.h = 0.5625;
    this.stepHeight = 0;
    this.seatY = -0.1;
    const plankTex = { oak: 0xa2834f, spruce: 0x725430, birch: 0xc4b077, jungle: 0xa07351, acacia: 0xa8582f, dark_oak: 0x4a3218, cherry: 0xe0a8a0, mangrove: 0x7a3a32 }[wood] ?? 0xa2834f;
    const mat = new THREE.MeshLambertMaterial({ color: plankTex });
    const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color(plankTex).multiplyScalar(0.7) });
    const g = new THREE.Group();
    const add = (w, h, d, x, y, z, m = mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); };
    add(1.2, 0.12, 1.9, 0, 0.06, 0, dark);              // hull floor
    add(0.12, 0.45, 1.9, -0.6, 0.3, 0); add(0.12, 0.45, 1.9, 0.6, 0.3, 0);   // sides
    add(1.2, 0.45, 0.12, 0, 0.3, -0.95); add(1.2, 0.45, 0.12, 0, 0.3, 0.95); // bow/stern
    add(1.1, 0.08, 0.3, 0, 0.32, 0.15, dark);            // seat
    for (const s of [-1, 1]) { const oar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), dark); oar.position.set(s * 0.75, 0.45, 0); oar.rotation.x = 0.3; g.add(oar); (this.oars ??= []).push(oar); }
    this.model = g;
    this.mats = [mat, dark];
    this.mesh.add(g);
  }
  itemId() { return I[this.wood + '_boat'] ?? I.oak_boat; }
  inWaterAt() {
    const w = this.world;
    const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
    for (let dy = 1; dy >= -1; dy--) { const y = Math.floor(this.pos.y + 0.2) + dy; if (w.getBlock(x, y, z) === B.water) return y; }
    return null;
  }
  control(input, dt, p) {
    const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0) - (input.analog ? (input.ax ?? 0) : 0) * (input.analog ? 1 : 0);
    this.yaw += turn * dt * 2.4;
    let thrust = (input.forward ? 1 : 0) - (input.back ? 0.5 : 0);
    if (input.analog) thrust = Math.max(-0.5, Math.min(1, -(input.az ?? 0)));
    const water = this.inWaterAt() != null;
    const accel = water ? 10 : 2;
    this.vel.x += -Math.sin(this.yaw) * thrust * accel * dt;
    this.vel.z += -Math.cos(this.yaw) * thrust * accel * dt;
    this.paddle = (this.paddle ?? 0) + Math.abs(thrust) * dt * 8;
    p.yaw += turn * dt * 2.4;
  }
  update(dt) {
    super.update(dt);
    if (this.hurtTime > 0) this.hurtTime -= dt;
    const wy = this.inWaterAt();
    if (wy != null) {
      const target = wy + 0.82;
      this.vel.y += (target - this.pos.y) * 30 * dt - this.vel.y * 4 * dt;
      this.vel.x *= Math.pow(0.6, dt * 2); this.vel.z *= Math.pow(0.6, dt * 2);
    } else {
      this.vel.y -= 32 * dt;
      if (this.onGround) { this.vel.x *= Math.pow(0.05, dt); this.vel.z *= Math.pow(0.05, dt); }
    }
    const max = 8;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > max) { this.vel.x *= max / hs; this.vel.z *= max / hs; }
    moveEntity(this, this.world, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, 0);
    this.model.rotation.y = this.yaw;
    this.model.rotation.z = this.hurtTime > 0 ? Math.sin(this.age * 40) * 0.1 : 0;
    if (this.oars) this.oars.forEach((o, i) => { o.rotation.x = 0.3 + Math.sin((this.paddle ?? 0) + i * Math.PI) * 0.5; });
    const l = this.lightAt(); for (const m of this.mats) m.emissive?.setRGB(0, 0, 0), m.color.multiplyScalar(1);
    void l;
  }
}

// ---------------------------------------------------------------- minecart
export class Minecart extends Vehicle {
  constructor(game, x, y, z) {
    super(game, x, y, z);
    this.w = 0.98; this.h = 0.7;
    this.stepHeight = 0;
    this.seatY = 0.15;
    this.speed = 0; this.dirv = new THREE.Vector3(1, 0, 0);
    const metal = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
    const inner = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
    const g = new THREE.Group();
    const add = (w, h, d, x, y, z, m = metal) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); };
    add(0.9, 0.08, 1.2, 0, 0.12, 0, inner);
    add(0.08, 0.55, 1.2, -0.45, 0.4, 0); add(0.08, 0.55, 1.2, 0.45, 0.4, 0);
    add(0.9, 0.55, 0.08, 0, 0.4, -0.6); add(0.9, 0.55, 0.08, 0, 0.4, 0.6);
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) add(0.1, 0.16, 0.16, x, 0.06, z, inner);
    this.model = g; this.mesh.add(g);
  }
  itemId() { return I.minecart; }
  control(input, dt, p) {
    // the rider can give a gentle push in the direction they look
    if (input.forward && Math.abs(this.speed) < 3) {
      const look = p.lookDir().setY(0).normalize();
      if (look.dot(this.dirv) < 0) { this.dirv.negate(); this.speed = -this.speed; }
      this.speed += dt * 2;
    }
  }
  railAt() {
    const w = this.world;
    const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
    for (const dy of [0, -1]) { const y = Math.floor(this.pos.y + 0.05) + dy; const id = w.getBlock(x, y, z); if (isRail(id)) return { x, y, z, id, meta: w.getMeta(x, y, z) }; }
    return null;
  }
  update(dt) {
    super.update(dt);
    if (this.hurtTime > 0) this.hurtTime -= dt;
    const r = this.railAt();
    if (!r) {
      // off the rails: plain physics
      this.vel.y -= 32 * dt;
      moveEntity(this, this.world, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, 0);
      if (this.onGround) { this.vel.x *= Math.pow(0.1, dt); this.vel.z *= Math.pow(0.1, dt); }
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      if (this.speed > 0.01) this.dirv.set(this.vel.x, 0, this.vel.z).normalize();
      return;
    }
    const m = (r.id === B.rail ? r.meta : r.meta & 7) % 10;
    const [e1, e2] = RAIL_DIRS[m] ?? RAIL_DIRS[0];
    const a = new THREE.Vector3(e1[0], 0, e1[1]), c = new THREE.Vector3(e2[0], 0, e2[1]);
    // travel toward the exit that best matches current direction
    let exit = this.dirv.dot(a) >= this.dirv.dot(c) ? e1 : e2;
    let entry = exit === e1 ? e2 : e1;
    const dir = new THREE.Vector3(exit[0] - entry[0], 0, exit[1] - entry[1]).normalize();
    this.dirv.copy(dir);
    // slope gravity
    const asc = exit[2] - entry[2];
    if (asc > 0) this.speed -= 6 * dt; else if (asc < 0) this.speed += 6 * dt;
    if (entry[2] > 0 && exit[2] === 0 && m >= 2 && m <= 5) this.speed += 6 * dt;
    // powered rails
    if (r.id === B.powered_rail) {
      if (r.meta & 8) { if (Math.abs(this.speed) < 0.5) { this.speed = 2; } else this.speed += Math.sign(this.speed) * 12 * dt; }
      else this.speed *= Math.pow(0.02, dt);
    }
    if (r.id === B.activator_rail && (r.meta & 8) && this.rider) this.rider.dismount();
    this.speed *= Math.pow(this.rider ? 0.94 : 0.5, dt);
    this.speed = Math.max(-8, Math.min(8, this.speed));
    if (this.speed < 0) { this.speed = -this.speed; this.dirv.negate(); }
    // snap to the rail centre line
    const cx = r.x + 0.5, cz = r.z + 0.5;
    if (m === 0 || m === 4 || m === 5) this.pos.x += (cx - this.pos.x) * Math.min(1, dt * 20);
    if (m === 1 || m === 2 || m === 3) this.pos.z += (cz - this.pos.z) * Math.min(1, dt * 20);
    if (m >= 6) { // curve: blend toward the exit axis
      this.pos.x += (cx - this.pos.x) * Math.min(1, dt * 6) * (exit[0] === 0 ? 1 : 0.2);
      this.pos.z += (cz - this.pos.z) * Math.min(1, dt * 6) * (exit[1] === 0 ? 1 : 0.2);
    }
    const step = this.speed * dt;
    this.pos.x += this.dirv.x * step; this.pos.z += this.dirv.z * step;
    // height along slopes
    if (m >= 2 && m <= 5) {
      const hi = RAIL_DIRS[m].find((e) => e[2] === 1);
      const t = hi[0] ? (hi[0] > 0 ? this.pos.x - r.x : r.x + 1 - this.pos.x) : (hi[1] > 0 ? this.pos.z - r.z : r.z + 1 - this.pos.z);
      this.pos.y = r.y + Math.max(0, Math.min(1, t)) + 0.0625;
    } else this.pos.y = r.y + 0.0625;
    // stop at dead ends
    const nx = Math.floor(this.pos.x + this.dirv.x * 0.51), nz = Math.floor(this.pos.z + this.dirv.z * 0.51);
    if ((nx !== r.x || nz !== r.z) && !isRail(this.world.getBlock(nx, r.y, nz)) && !isRail(this.world.getBlock(nx, r.y + 1, nz)) && !isRail(this.world.getBlock(nx, r.y - 1, nz))) {
      const solid = BLOCKS[this.world.getBlock(nx, r.y, nz)]?.solid;
      if (solid) { this.speed = 0; this.pos.x = cx; this.pos.z = cz; }
    }
    this.vel.set(this.dirv.x * this.speed, 0, this.dirv.z * this.speed);
    this.yaw = Math.atan2(this.dirv.x, this.dirv.z);
    this.model.rotation.y = this.yaw;
    this.model.rotation.x = m >= 2 && m <= 5 ? -Math.PI / 4 * (RAIL_DIRS[m][1][2] ? 1 : -1) * (this.dirv.dot(new THREE.Vector3(RAIL_DIRS[m][1][0], 0, RAIL_DIRS[m][1][1])) > 0 ? 1 : -1) : 0;
    // push other entities a little / bump into mobs
    for (const e of this.game.entities) if (e !== this && e.type && !e.dead && e.pos.distanceTo(this.pos) < 0.8 && !this.rider && this.speed > 1 && e.type !== 'ender_dragon') { this.rider = e; e.riding = this; }
    if (this.rider && this.rider !== this.game.player && this.rider.pos) { this.rider.pos.copy(this.seat()); this.rider.vel?.set(0, 0, 0); if (this.rider.dead) this.rider = null; }
  }
}

// ---------------------------------------------------------------- fishing bobber
export class FishingBobber extends Entity {
  constructor(game, owner, rodStack) {
    const eye = owner.eyePos();
    super(game, eye.x, eye.y, eye.z);
    this.owner = owner; this.rod = rodStack;
    this.w = this.h = 0.25; this.stepHeight = 0;
    const dir = owner.lookDir();
    this.vel.copy(dir.multiplyScalar(14)).add(new THREE.Vector3(0, 3, 0));
    const ball = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshLambertMaterial({ color: 0xd83020 }));
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    top.position.y = 0.12; ball.add(top);
    this.mesh.add(ball); this.ball = ball;
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: 0x202020 }));
    this.line.frustumCulled = false;
    game.scene.add(this.line);
    this.waitTime = this.newWait();
    this.biteTime = 0;
  }
  newWait() { const lure = enchLevel(this.rod, 'lure'); return Math.max(1.5, 5 + Math.random() * 25 - lure * 5) * (this.game.weather?.rain > 0.5 ? 0.75 : 1); }
  update(dt) {
    super.update(dt);
    const w = this.world;
    const inWater = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z)) === B.water;
    if (this.hooked && !this.hooked.dead) { this.pos.copy(this.hooked.pos).add(new THREE.Vector3(0, this.hooked.h * 0.8, 0)); }
    else if (inWater) {
      const surface = Math.floor(this.pos.y) + 0.88;
      this.vel.y += (surface - this.pos.y) * 20 * dt - this.vel.y * 6 * dt;
      this.vel.x *= Math.pow(0.1, dt); this.vel.z *= Math.pow(0.1, dt);
      this.pos.addScaledVector(this.vel, dt);
      // waiting for a bite
      if (this.biteTime > 0) {
        this.biteTime -= dt;
        this.ball.position.y = -0.15;
        if (this.biteTime <= 0) { this.waitTime = this.newWait(); this.ball.position.y = 0; }
      } else {
        this.waitTime -= dt;
        if (this.waitTime < 2 && Math.random() < dt * 8) this.game.particles.spawn(this.pos.x + (Math.random() - 0.5) * this.waitTime, this.pos.y + 0.1, this.pos.z + (Math.random() - 0.5) * this.waitTime, new THREE.Color(0xd0e8ff), new THREE.Vector3(0, 0.5, 0), 0.4, 0.05, 0);
        if (this.waitTime <= 0) { this.biteTime = 1.0; this.game.sfx('splash'); for (let i = 0; i < 8; i++) this.game.particles.spawn(this.pos.x, this.pos.y + 0.1, this.pos.z, new THREE.Color(0xe0f0ff), new THREE.Vector3((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3), 0.5, 0.06, 8); }
      }
    } else {
      this.physics(dt, 20, 0.92);
      if (!this.hooked) for (const e of this.game.entities) if (e.type && !e.dead && e !== this.owner && e.pos.distanceTo(this.pos) < e.w + 0.3 && this.pos.y > e.pos.y && this.pos.y < e.pos.y + e.h) { this.hooked = e; break; }
    }
    if (this.owner.pos.distanceTo(this.pos) > 32 || this.age > 120 || this.owner.heldItem()?.id !== I.fishing_rod) this.retract(false);
    // line from rod tip to bobber
    const tip = this.owner.eyePos().add(this.owner.lookDir().multiplyScalar(0.8)).add(new THREE.Vector3(0, -0.3, 0));
    const pos = this.lineGeo.attributes.position;
    pos.setXYZ(0, tip.x, tip.y, tip.z); pos.setXYZ(1, this.pos.x, this.pos.y + 0.1, this.pos.z); pos.needsUpdate = true;
  }
  // reel in: catch something if a fish is biting
  retract(byPlayer = true) {
    if (this.remove) return;
    this.remove = true;
    this.game.scene.remove(this.line);
    this.owner.bobber = null;
    if (!byPlayer) return;
    const g = this.game, p = this.owner;
    if (this.hooked && !this.hooked.dead) { const d = p.pos.clone().sub(this.hooked.pos).normalize(); this.hooked.vel.add(d.multiplyScalar(10)).add(new THREE.Vector3(0, 4, 0)); p.damageHeld(5); return; }
    if (this.biteTime > 0) {
      const luck = enchLevel(this.rod, 'luck_of_the_sea');
      const r = Math.random();
      const treasureChance = 0.05 + luck * 0.021, junkChance = Math.max(0, 0.1 - luck * 0.025);
      let stack;
      if (r < treasureChance) {
        const t = [['bow', 1], ['enchanted_book', 1], ['fishing_rod', 1], ['name_tag', 1], ['saddle', 1]][Math.floor(Math.random() * 5)];
        stack = { id: I[t[0]], count: 1, dmg: 0 };
        if (t[0] === 'enchanted_book') stack.data = { ench: { [['mending', 'luck_of_the_sea', 'lure', 'unbreaking', 'protection'][Math.floor(Math.random() * 5)]]: 1 } };
      } else if (r < treasureChance + junkChance) {
        const j = ['bowl', 'leather', 'leather_boots', 'rotten_flesh', 'stick', 'string', 'bone', 'ink_sac', 'glass_bottle'][Math.floor(Math.random() * 9)];
        stack = { id: I[j], count: 1, dmg: 0 };
      } else {
        const f = Math.random();
        stack = { id: f < 0.6 ? I.cod : f < 0.85 ? I.salmon : f < 0.87 ? I.tropical_fish : I.pufferfish, count: 1, dmg: 0 };
      }
      const e = g.spawnItemAt(this.pos.x, this.pos.y + 0.3, this.pos.z, stack);
      if (e) { const d = p.pos.clone().add(new THREE.Vector3(0, 1.5, 0)).sub(this.pos); e.vel.set(d.x * 1.1, d.y * 1.1 + Math.sqrt(d.length()) * 1.6, d.z * 1.1); e.pickupDelay = 0; }
      g.spawnXP(p.pos.x, p.pos.y + 0.5, p.pos.z, 1 + Math.floor(Math.random() * 6));
      g.achieve('Un buen pescador');
      p.damageHeld(1);
    }
  }
}
export { Vehicle };
void ITEMS;
