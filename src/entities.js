// Entities: mobs (with AI), dropped items, projectiles, primed TNT, falling blocks, end crystals.
import * as THREE from '../lib/three.module.min.js';
import { BLOCKS, B, ITEMS, I, sameKind } from './registry.js';
import { moveEntity, aabbIntersectsBlocks } from './physics.js';
import { buildModel, setTint } from './models.js';
import { atlasCanvas, tileUV, itemSpriteCanvas, tileCanvas } from './textures.js';
import { SOLID, worldUniforms } from './world.js';
import { makeFireShell } from './shaders.js';
import { PROFESSIONS, JOB_BLOCK, initVillager, restock } from './villagers.js';

const GRAV = 32;
let nextEntityId = 1;

// ---------------------------------------------------------------- shared meshes for items/blocks
const atlasTexL = new THREE.CanvasTexture(atlasCanvas);
atlasTexL.magFilter = atlasTexL.minFilter = THREE.NearestFilter; atlasTexL.flipY = false; atlasTexL.colorSpace = THREE.SRGBColorSpace;
const blockMat = new THREE.MeshLambertMaterial({ map: atlasTexL, alphaTest: 0.5, side: THREE.DoubleSide });
const spriteMatCache = new Map();
function texName(b, face) {
  const t = b.tex;
  if (typeof t === 'string') return t;
  return face === 2 ? t.top : face === 3 ? t.bottom : face === 4 && b.orient ? t.front : t.side;
}
export function makeBlockMesh(id, size = 1) {
  const b = BLOCKS[id];
  if (b.render === 'cross') return makeSpriteMesh(id, size);
  const geo = new THREE.BoxGeometry(size, size, size);
  const uv = geo.attributes.uv;
  // BoxGeometry face order: +x,-x,+y,-y,+z,-z ; 4 verts each
  for (let f = 0; f < 6; f++) {
    const [u0, v0, s] = tileUV(texName(b, f));
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, u0 + u * s, v0 + (1 - v) * s);
    }
  }
  const mat = blockMat.clone();
  const mesh = new THREE.Mesh(geo, mat);
  if (b.tint) mat.color.setHex(b.tint.startsWith('foliage') ? 0x77ab2f : b.tint === 'water' ? 0x3f76e4 : 0xffffff);
  return mesh;
}
export function makeSpriteMesh(id, size = 1) {
  const name = ITEMS[id]?.name;
  let canvas = itemSpriteCanvas(name);
  if (!canvas && BLOCKS[id]) canvas = tileCanvas(typeof BLOCKS[id].tex === 'string' ? BLOCKS[id].tex : BLOCKS[id].tex.side);
  let mat = spriteMatCache.get(name);
  if (!mat) {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
    spriteMatCache.set(name, mat);
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat.clone());
}
export function makeItemMesh(id, size) {
  if (id < 1024 && BLOCKS[id] && BLOCKS[id].render !== 'cross' && !itemSpriteCanvas(ITEMS[id]?.name)) return makeBlockMesh(id, size * 0.55);
  return makeSpriteMesh(id, size);
}

// ---------------------------------------------------------------- base entity
export class Entity {
  constructor(game, x, y, z) {
    this.id = nextEntityId++;
    this.game = game;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.w = 0.6; this.h = 1.8;
    this.yaw = 0; this.onGround = false;
    this.dead = false; this.remove = false;
    this.mesh = new THREE.Group();
    this.age = 0;
    this.inWater = false; this.inLava = false;
    this.fire = 0;
  }
  get world() { return this.game.world; }
  physics(dt, gravity = GRAV, drag = 0.98) {
    const w = this.world;
    this.inWater = aabbIntersectsBlocks(w, this.pos.x - this.w / 2, this.pos.y, this.pos.z - this.w / 2, this.pos.x + this.w / 2, this.pos.y + this.h * 0.6, this.pos.z + this.w / 2, (id) => id === B.water);
    this.inLava = aabbIntersectsBlocks(w, this.pos.x - this.w / 2, this.pos.y, this.pos.z - this.w / 2, this.pos.x + this.w / 2, this.pos.y + this.h * 0.6, this.pos.z + this.w / 2, (id) => id === B.lava);
    if (this.inWater || this.inLava) {
      this.vel.y -= gravity * 0.15 * dt;
      this.vel.multiplyScalar(this.inLava ? 0.85 : 0.9);
    } else this.vel.y -= gravity * dt;
    this.vel.y = Math.max(this.vel.y, -60);
    moveEntity(this, w, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, this.stepHeight ?? 0.6);
    if (this.onGround) { this.vel.x *= 0.6 ** (dt * 20 / 4); this.vel.z *= 0.6 ** (dt * 20 / 4); }
    else { this.vel.x *= drag ** (dt * 20); this.vel.z *= drag ** (dt * 20); }
  }
  lightAt() {
    const l = this.world.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z));
    const s = (l >> 4) / 15 * this.game.daylightLevel, b = (l & 15) / 15;
    return Math.max(0.12, Math.max(s, b, this.game.dimAmbient));
  }
  aabb() { const hw = this.w / 2; return { min: new THREE.Vector3(this.pos.x - hw, this.pos.y, this.pos.z - hw), max: new THREE.Vector3(this.pos.x + hw, this.pos.y + this.h, this.pos.z + hw) }; }
  update(dt) { this.age += dt; }
  sync() { this.mesh.position.copy(this.pos); if (this.shadowR) this.updateShadow(); }
  /** round blob shadow on the ground below (hidden when the shader pack draws real shadows) */
  updateShadow() {
    if (!this.shadow) {
      this.shadow = new THREE.Mesh(SHADOW_GEO, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }));
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.scale.setScalar(this.shadowR * 2);
      this.shadow.renderOrder = 1;
      this.mesh.add(this.shadow);
    }
    const w = this.world;
    let top = null;
    const fx = Math.floor(this.pos.x), fz = Math.floor(this.pos.z), fy = Math.floor(this.pos.y + 0.01);
    for (let y = fy; y >= fy - 3; y--) {
      const id = w.getBlock(fx, y, fz);
      if (SOLID[id]) { const bb = BLOCKS[id].shape === 'slab' && !(w.getMeta(fx, y, fz) & 8) ? 0.5 : 1; top = y + bb; if (top > this.pos.y + 0.01) top = y + 1; break; }
    }
    const h = top == null ? 9 : this.pos.y - top;
    const vis = !this.dead && h < 3 && h > -0.2 && worldUniforms.shaderOn.value < 0.5 && !this.inWater;
    this.shadow.visible = vis;
    if (!vis) return;
    this.shadow.position.y = top - this.pos.y + 0.015;
    this.shadow.material.opacity = 0.5 * (1 - h / 3) * Math.min(1, this.lightAt() * 1.5);
  }
}

const SHADOW_GEO = new THREE.PlaneGeometry(1, 1);
let shadowTex = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 2, 16, 16, 16);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

// ---------------------------------------------------------------- item entity
export class ItemEntity extends Entity {
  constructor(game, x, y, z, stack) {
    super(game, x, y, z);
    this.stack = stack;
    this.w = 0.25; this.h = 0.25; this.shadowR = 0.18;
    this.pickupDelay = 0.6;
    this.stepHeight = 0;
    const m = makeItemMesh(stack.id, 0.4);
    this.inner = m;
    this.mesh.add(m);
    this.bob = Math.random() * 6;
  }
  update(dt) {
    super.update(dt);
    this.pickupDelay -= dt;
    this.physics(dt, 24, 0.95);
    if (this.inWater) this.vel.y += 30 * dt;
    if (this.inLava) { this.remove = true; this.game.sfx('fizz'); }
    if (this.age > 300 || this.pos.y < -64) this.remove = true;
    this.inner.rotation.y += dt * 1.5;
    this.inner.position.y = 0.2 + Math.sin(this.age * 2 + this.bob) * 0.06;
    const l = this.lightAt();
    this.inner.material.color?.setRGB(l, l, l);
    // merge with nearby equal stacks
    if (((this.age * 4) | 0) % 4 === 0) for (const e of this.game.entities) {
      if (e !== this && e instanceof ItemEntity && !e.remove && sameKind(e.stack, this.stack) && e.pos.distanceToSquared(this.pos) < 0.6) {
        const max = ITEMS[this.stack.id].stack;
        if (this.stack.count + e.stack.count <= max) { this.stack.count += e.stack.count; e.remove = true; }
      }
    }
  }
}

// ---------------------------------------------------------------- falling block / tnt
export class FallingBlock extends Entity {
  constructor(game, x, y, z, id) {
    super(game, x + 0.5, y, z + 0.5);
    this.block = id; this.w = 0.98; this.h = 0.98; this.stepHeight = 0;
    this.inner = makeBlockMesh(id, 1);
    this.inner.position.y = 0.5;
    this.mesh.add(this.inner);
  }
  update(dt) {
    super.update(dt);
    this.physics(dt, GRAV, 1);
    const l = this.lightAt(); this.inner.material.color.setRGB(l, l, l);
    if (this.onGround || this.age > 20) {
      const x = Math.floor(this.pos.x), y = Math.floor(this.pos.y + 0.5), z = Math.floor(this.pos.z);
      const cur = this.world.getBlock(x, y, z);
      if (cur === 0 || BLOCKS[cur].replaceable) this.world.setBlock(x, y, z, this.block);
      else this.game.spawnItem(this.pos.x, this.pos.y, this.pos.z, { id: this.block, count: 1 });
      this.remove = true;
    }
  }
}
export class PrimedTNT extends Entity {
  constructor(game, x, y, z, fuse = 4) {
    super(game, x + 0.5, y, z + 0.5);
    this.w = 0.98; this.h = 0.98; this.fuse = fuse;
    this.vel.set((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2);
    this.inner = makeBlockMesh(B.tnt, 1); this.inner.position.y = 0.5;
    this.mesh.add(this.inner);
  }
  update(dt) {
    super.update(dt);
    this.physics(dt);
    this.fuse -= dt;
    const flash = Math.floor(this.fuse * 5) % 2 === 0;
    const l = this.lightAt();
    this.inner.material.color.setRGB(flash ? 1.8 : l, flash ? 1.8 : l, flash ? 1.8 : l);
    this.inner.scale.setScalar(this.fuse < 0.4 ? 1 + (0.4 - this.fuse) * 0.5 : 1);
    if (this.fuse <= 0) { this.remove = true; this.game.explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 4, false); }
  }
}

// ---------------------------------------------------------------- projectiles
export class Projectile extends Entity {
  constructor(game, kind, pos, vel, owner) {
    super(game, pos.x, pos.y, pos.z);
    this.kind = kind; this.owner = owner;
    this.vel.copy(vel);
    this.w = 0.25; this.h = 0.25;
    this.stuck = false;
    const g = { levitation_bolt: 0, water_bolt: 0, spit: 0.03, ash_skull: 0, arrow: 0.05, snowball: 0.03, egg: 0.03, ender_pearl: 0.03, fireball: 0, small_fireball: 0, potion: 0.05, splash: 0.05, xp_bottle: 0.05, eye: 0 }[kind] ?? 0.03;
    this.grav = g * 400;
    if (kind === 'arrow') {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a6436 }));
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: 0x9a9a9a }));
      tip.position.z = 0.3; shaft.add(tip);
      this.inner = shaft;
    } else if (kind === 'levitation_bolt' || kind === 'water_bolt' || kind === 'spit' || kind === 'ash_skull') {
      const col = { levitation_bolt: 0xf0e0ff, water_bolt: 0x5ac8e8, spit: 0xe8e8d8, ash_skull: 0x2a2626 }[kind];
      const s = kind === 'ash_skull' ? 0.5 : 0.25;
      this.inner = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: col }));
      this.homing = kind === 'levitation_bolt';
    } else if (kind === 'fireball' || kind === 'small_fireball') {
      const s = kind === 'fireball' ? 0.9 : 0.35;
      this.inner = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: kind === 'fireball' ? 0xff7a1a : 0xffb030 }));
      this.w = this.h = s;
    } else {
      const id = { snowball: I.snowball, egg: I.egg, ender_pearl: I.ender_pearl, potion: I.splash_potion, splash: I.splash_potion, xp_bottle: I.experience_bottle, eye: I.ender_eye }[kind];
      this.inner = makeSpriteMesh(id, 0.35);
    }
    this.mesh.add(this.inner);
  }
  update(dt) {
    super.update(dt);
    if (this.age > 60) { this.remove = true; return; }
    if (this.kind === 'eye') return this.updateEye(dt);
    if (this.stuck) { if (this.age > 30) this.remove = true; return; }
    if (this.homing && this.game.player && this.age < 6) { const to = this.game.player.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(this.pos).normalize().multiplyScalar(8); this.vel.lerp(to, Math.min(1, dt * 1.5)); }
    this.vel.y -= this.grav * dt;
    const steps = Math.ceil(this.vel.length() * dt / 0.2);
    const step = this.vel.clone().multiplyScalar(dt / steps);
    for (let s = 0; s < steps; s++) {
      this.pos.add(step);
      // entity hits
      for (const e of this.game.entities) {
        if (!(e instanceof Mob) || e === this.owner || e.dead) continue;
        if (this.hits(e)) return this.impactEntity(e);
      }
      if (this.owner !== this.game.player && this.game.player.mode !== 'spectator' && this.hits(this.game.player)) return this.impactEntity(this.game.player);
      const id = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
      if (id && SOLID[id]) return this.impactBlock(id);
    }
    if (this.kind === 'arrow') { this.inner.rotation.order = 'YXZ'; this.inner.rotation.y = Math.atan2(this.vel.x, this.vel.z); this.inner.rotation.x = -Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z)); }
    else this.inner.rotation.y += dt * 4;
    if (this.kind !== 'arrow' && this.inner.lookAt && this.game.camera) this.inner.lookAt(this.game.camera.position);
  }
  hits(e) {
    const hw = e.w / 2 + 0.15;
    return this.pos.x > e.pos.x - hw && this.pos.x < e.pos.x + hw && this.pos.z > e.pos.z - hw && this.pos.z < e.pos.z + hw && this.pos.y > e.pos.y - 0.1 && this.pos.y < e.pos.y + e.h + 0.1;
  }
  impactEntity(e) {
    const k = this.kind;
    if (e.type === 'enderman' && k !== 'ender_pearl') { e.teleport(); this.remove = true; return; }
    if (k === 'arrow') {
      const dir = this.vel.clone().normalize().multiplyScalar(1 + (this.punch ?? 0) * 1.2);
      if (e.hurt(Math.max(2, Math.ceil(this.vel.length() / 60 * 9 * (this.power ?? 1))), this.owner, dir) && this.flame && e.fire != null) e.fire = Math.max(e.fire, 5);
    }
    else if (k === 'levitation_bolt') { e.hurt(4, this.owner); if (e.addEffect) e.addEffect('levitation', 10, 0); }
    else if (k === 'water_bolt') e.hurt(6, this.owner, this.vel.clone().normalize());
    else if (k === 'spit') e.hurt(1, this.owner, this.vel.clone().normalize());
    else if (k === 'ash_skull') { e.hurt(8, this.owner); if (e.addEffect) e.addEffect('wither', 10, 1); this.game.explode(this.pos.x, this.pos.y, this.pos.z, 1, false); }
    else if (k === 'splash' || k === 'potion') { this.game.splashPotion(this.pos, this.potion ?? 'harming', this.owner); }
    else if (k === 'xp_bottle') { this.game.spawnXP(this.pos.x, this.pos.y, this.pos.z, 3 + Math.floor(Math.random() * 9)); this.game.sfx('glass'); }
    else if (k === 'snowball') e.hurt(e.type === 'blaze' ? 3 : 0, this.owner, this.vel.clone().normalize());
    else if (k === 'fireball') { this.game.explode(this.pos.x, this.pos.y, this.pos.z, 1, true); e.hurt(6, this.owner); }
    else if (k === 'small_fireball') { e.hurt(5, this.owner); e.fire = 5; }
    else if (k === 'ender_pearl') this.pearlTeleport();
    else if (k === 'egg') this.eggHatch();
    this.remove = true;
  }
  impactBlock(id) {
    const k = this.kind;
    if (k === 'arrow') { this.stuck = true; this.vel.set(0, 0, 0); this.age = 0; this.pickup = this.owner === this.game.player; return; }
    if (k === 'fireball') this.game.explode(this.pos.x, this.pos.y, this.pos.z, 1, true);
    if (k === 'ash_skull') this.game.explode(this.pos.x, this.pos.y, this.pos.z, 1.2, false);
    if (k === 'small_fireball') { const p = this.pos.clone().sub(this.vel.clone().normalize().multiplyScalar(0.3)); const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z); if (!this.world.getBlock(x, y, z)) this.world.setBlock(x, y, z, B.fire); }
    if (k === 'ender_pearl') this.pearlTeleport();
    if (k === 'egg') this.eggHatch();
    if (k === 'splash' || k === 'potion') this.game.splashPotion(this.pos, this.potion ?? 'harming', this.owner);
    if (k === 'xp_bottle') { this.game.spawnXP(this.pos.x, this.pos.y + 0.3, this.pos.z, 3 + Math.floor(Math.random() * 9)); this.game.sfx('glass'); }
    this.remove = true;
    void id;
  }
  pearlTeleport() {
    const p = this.game.player;
    if (this.owner !== p) return;
    p.pos.set(this.pos.x, this.pos.y + 0.1, this.pos.z);
    p.vel.set(0, 0, 0);
    p.fallStart = p.pos.y;
    if (p.mode === 'survival') p.hurt(5, null);
  }
  eggHatch() { if (Math.random() < 0.125) this.game.spawnMob('chicken', this.pos.x, this.pos.y, this.pos.z, { baby: true }); }
  updateEye(dt) {
    const t = this.target;
    const d = new THREE.Vector3(t.x - this.pos.x, 0, t.z - this.pos.z);
    if (this.age < 2.2 && d.length() > 1) {
      d.normalize().multiplyScalar(8);
      this.pos.x += d.x * dt; this.pos.z += d.z * dt;
      this.pos.y += (this.age < 1.2 ? 3 : -0.8) * dt;
    } else {
      this.remove = true;
      if (Math.random() < 0.8) this.game.spawnItem(this.pos.x, this.pos.y, this.pos.z, { id: I.ender_eye, count: 1 });
      else this.game.sfx('glass');
    }
    if (this.game.camera) this.inner.lookAt(this.game.camera.position);
  }
}

// ---------------------------------------------------------------- mobs
export const MOB_INFO = {
  pig: { hp: 10, w: 0.9, h: 0.9, speed: 2.4, passive: true, food: ['carrot', 'potato'], drops: [['porkchop', 1, 3]], xp: 2 },
  cow: { hp: 10, w: 0.9, h: 1.4, speed: 2.2, passive: true, food: ['wheat'], drops: [['beef', 1, 3], ['leather', 0, 2]], xp: 2 },
  sheep: { hp: 8, w: 0.9, h: 1.3, speed: 2.3, passive: true, food: ['wheat'], drops: [['mutton', 1, 2]], xp: 2 },
  chicken: { hp: 4, w: 0.4, h: 0.7, speed: 2.2, passive: true, food: ['wheat_seeds'], drops: [['chicken', 1, 1], ['feather', 0, 2]], xp: 2 },
  wolf: { hp: 8, w: 0.6, h: 0.85, speed: 3.6, passive: true, neutral: true, damage: 4, food: ['bone'], drops: [], xp: 2 },
  horse: { hp: 22, w: 1.3, h: 1.6, speed: 3.2, passive: true, food: ['wheat', 'apple'], drops: [['leather', 0, 2]], xp: 2 },
  villager: { hp: 20, w: 0.6, h: 1.95, speed: 2.0, passive: true, drops: [], xp: 0 },
  zombie_villager: { hp: 20, w: 0.6, h: 1.95, speed: 2.4, damage: 3, drops: [['rotten_flesh', 0, 2]], xp: 5, burns: true },
  iron_golem: { hp: 100, w: 1.4, h: 2.7, speed: 1.6, passive: true, neutral: true, damage: 15, drops: [['iron_ingot', 3, 5], ['poppy', 0, 2]], xp: 0 },
  zombie: { hp: 20, w: 0.6, h: 1.95, speed: 2.6, damage: 3, drops: [['rotten_flesh', 0, 2]], rare: [['iron_ingot', 0.025], ['carrot', 0.025], ['potato', 0.025]], xp: 5, burns: true },
  skeleton: { hp: 20, w: 0.6, h: 1.99, speed: 2.6, damage: 3, ranged: 'arrow', drops: [['bone', 0, 2], ['arrow', 0, 2]], xp: 5, burns: true },
  creeper: { hp: 20, w: 0.6, h: 1.7, speed: 2.4, damage: 0, drops: [['gunpowder', 0, 2]], xp: 5 },
  spider: { hp: 16, w: 1.4, h: 0.9, speed: 3.4, damage: 2, drops: [['string', 0, 2]], xp: 5, climbs: true },
  enderman: { hp: 40, w: 0.6, h: 2.9, speed: 3.5, damage: 7, neutral: true, drops: [['ender_pearl', 0, 1]], xp: 5 },
  witch: { hp: 26, w: 0.6, h: 1.95, speed: 2.2, damage: 0, ranged: 'potion', drops: [['glowstone_dust', 0, 2], ['redstone', 0, 2], ['sugar', 0, 2]], xp: 5 },
  slime: { hp: 16, w: 2.04, h: 2.04, speed: 2.4, damage: 4, drops: [['slime_ball', 0, 2]], xp: 4 },
  zombified_piglin: { hp: 20, w: 0.6, h: 1.95, speed: 2.8, damage: 8, neutral: true, drops: [['rotten_flesh', 0, 1], ['gold_nugget', 0, 1]], rare: [['gold_ingot', 0.025]], xp: 5 },
  ghast: { hp: 10, w: 4, h: 4, speed: 1.5, flying: true, ranged: 'fireball', drops: [['ghast_tear', 0, 1], ['gunpowder', 0, 2]], xp: 5 },
  blaze: { hp: 20, w: 0.6, h: 1.8, speed: 2.3, flying: true, ranged: 'small_fireball', damage: 6, drops: [['blaze_rod', 0, 1]], xp: 10, fireImmune: true },
  ender_dragon: { hp: 200, w: 8, h: 4, speed: 12, flying: true, damage: 10, drops: [], xp: 12000, boss: true },
  // animals
  fox: { hp: 10, w: 0.6, h: 0.7, speed: 4.2, passive: true, food: ['sweet_berries'], drops: [], xp: 2 },
  rabbit: { hp: 3, w: 0.4, h: 0.5, speed: 3.6, passive: true, hops: true, food: ['carrot', 'dandelion'], drops: [['rabbit', 0, 1], ['rabbit_hide', 0, 1]], rare: [['rabbit_foot', 0.1]], xp: 2 },
  cat: { hp: 10, w: 0.6, h: 0.7, speed: 3.4, passive: true, food: ['cod', 'salmon'], drops: [['string', 0, 2]], xp: 2, tameWith: ['cod', 'salmon'] },
  parrot: { hp: 6, w: 0.5, h: 0.9, speed: 3, passive: true, flier: true, food: ['wheat_seeds'], drops: [['feather', 1, 2]], xp: 2, tameWith: ['wheat_seeds'] },
  panda: { hp: 20, w: 1.3, h: 1.25, speed: 1.6, passive: true, food: ['sugar_cane'], drops: [], xp: 2 },
  bee: { hp: 10, w: 0.7, h: 0.6, speed: 3, passive: true, neutral: true, flier: true, damage: 2, onHit: 'poison', food: ['dandelion', 'poppy', 'cornflower'], drops: [], xp: 2 },
  goat: { hp: 10, w: 0.9, h: 1.3, speed: 2.8, passive: true, food: ['wheat'], drops: [], rare: [['goat_horn', 0.1]], xp: 2 },
  frog: { hp: 10, w: 0.5, h: 0.5, speed: 2.6, passive: true, hops: true, amphibious: true, food: ['slime_ball'], drops: [], xp: 2 },
  turtle: { hp: 30, w: 1.2, h: 0.4, speed: 1.2, passive: true, amphibious: true, food: ['sugar_cane'], drops: [], rare: [['turtle_scute', 0.3]], xp: 2 },
  squid: { hp: 10, w: 0.8, h: 0.8, speed: 2, passive: true, aquatic: true, drops: [['ink_sac', 1, 3]], xp: 2 },
  cod: { hp: 3, w: 0.5, h: 0.3, speed: 3, passive: true, aquatic: true, drops: [['cod', 1, 1]], xp: 1 },
  salmon: { hp: 3, w: 0.7, h: 0.4, speed: 3.2, passive: true, aquatic: true, drops: [['salmon', 1, 1]], xp: 1 },
  tropical_fish: { hp: 3, w: 0.5, h: 0.4, speed: 2.6, passive: true, aquatic: true, drops: [['tropical_fish', 1, 1]], xp: 1 },
  dolphin: { hp: 10, w: 0.9, h: 0.6, speed: 7, passive: true, neutral: true, aquatic: true, damage: 3, drops: [['cod', 0, 1]], xp: 2 },
  polar_bear: { hp: 30, w: 1.4, h: 1.4, speed: 2.6, passive: true, neutral: true, damage: 6, drops: [['cod', 0, 2], ['salmon', 0, 2]], xp: 3 },
  llama: { hp: 22, w: 0.9, h: 1.87, speed: 2.4, passive: true, neutral: true, ranged: 'spit', food: ['wheat', 'hay_block'], drops: [['leather', 0, 2]], xp: 2 },
  // monsters
  husk: { hp: 20, w: 0.6, h: 1.95, speed: 2.6, damage: 3, onHit: 'hunger', drops: [['rotten_flesh', 0, 2]], rare: [['iron_ingot', 0.025]], xp: 5 },
  drowned: { hp: 20, w: 0.6, h: 1.95, speed: 2.4, damage: 3, amphibious: true, drops: [['rotten_flesh', 0, 2]], rare: [['copper_ingot', 0.1], ['fishing_rod', 0.03]], xp: 5, burns: true },
  stray: { hp: 20, w: 0.6, h: 1.99, speed: 2.6, damage: 3, ranged: 'arrow', onShot: 'slowness', drops: [['bone', 0, 2], ['arrow', 0, 2]], xp: 5, burns: true },
  cave_spider: { hp: 12, w: 0.7, h: 0.5, speed: 3.6, damage: 2, onHit: 'poison', drops: [['string', 0, 2]], rare: [['spider_eye', 0.3]], xp: 5, climbs: true, scale: 0.7, tint: 0x3a5a8a },
  silverfish: { hp: 8, w: 0.4, h: 0.3, speed: 3.2, damage: 1, drops: [], xp: 5 },
  magma_blob: { hp: 16, w: 2.04, h: 2.04, speed: 2.6, damage: 5, drops: [['magma_cream', 0, 1]], xp: 4, fireImmune: true, slimeLike: true },
  night_wraith: { hp: 20, w: 0.9, h: 0.9, speed: 7, damage: 4, flier: true, swoops: true, drops: [['phantom_membrane', 0, 1]], xp: 5, burns: true },
  bandit: { hp: 24, w: 0.6, h: 1.95, speed: 2.8, damage: 3, ranged: 'arrow', drops: [['arrow', 0, 2]], rare: [['emerald', 0.3]], xp: 5 },
  brute: { hp: 24, w: 0.6, h: 1.95, speed: 3.2, damage: 8, drops: [], rare: [['emerald', 0.3], ['iron_axe', 0.08]], xp: 5 },
  abyssal_eel: { hp: 30, w: 1, h: 0.8, speed: 4, damage: 4, aquatic: true, ranged: 'water_bolt', drops: [['prismarine_shard', 0, 2], ['cod', 0, 1]], xp: 10 },
  purpur_sentinel: { hp: 30, w: 1, h: 1, speed: 0, damage: 0, ranged: 'levitation_bolt', stationary: true, drops: [['shulker_shell', 0, 1]], xp: 5 },
  ash_goblin: { hp: 16, w: 0.6, h: 1.4, speed: 3, passive: true, neutral: true, damage: 5, barters: true, fireImmune: true, drops: [['gold_nugget', 0, 3]], xp: 5 },
  hellboar: { hp: 40, w: 1.4, h: 1.4, speed: 3, damage: 6, knock: 2, food: ['crimson_fungus'], drops: [['porkchop', 2, 4], ['leather', 0, 1]], xp: 5, fireImmune: true },
  lava_wader: { hp: 20, w: 0.9, h: 1.7, speed: 2.4, passive: true, lavaWalker: true, fireImmune: true, food: ['warped_fungus'], drops: [['string', 2, 5]], xp: 2 },
  charred_skeleton: { hp: 20, w: 0.7, h: 2.4, speed: 3, damage: 8, onHit: 'wither', drops: [['coal', 0, 1], ['bone', 0, 2]], rare: [['wither_skeleton_skull', 0.04]], xp: 5, fireImmune: true },
  ash_colossus: { hp: 300, w: 1.2, h: 3.2, speed: 4, flying: true, ranged: 'ash_skull', damage: 8, drops: [['nether_star', 1, 1]], xp: 50, boss: true, fireImmune: true },
};
const HOSTILE = new Set(['husk', 'drowned', 'stray', 'cave_spider', 'silverfish', 'magma_blob', 'night_wraith', 'bandit', 'brute', 'abyssal_eel', 'purpur_sentinel', 'hellboar', 'charred_skeleton', 'ash_colossus', 'zombie_villager', 'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'slime', 'zombified_piglin', 'ghast', 'blaze', 'ender_dragon']);

export class Mob extends Entity {
  constructor(game, type, x, y, z, opts = {}) {
    super(game, x, y, z);
    this.type = type;
    const info = MOB_INFO[type];
    this.info = info;
    this.size = opts.size ?? (type === 'slime' || type === 'magma_blob' ? 2 : 1);
    this.baby = !!opts.baby;
    const sc = this.baby ? 0.5 : type === 'slime' || type === 'magma_blob' ? this.size / 2 : 1;
    this.w = info.w * sc; this.h = info.h * sc;
    this.shadowR = info.flier || type === 'ghast' || type === 'ender_dragon' ? 0 : Math.min(1.6, Math.max(0.25, this.w * 0.75));
    this.maxHealth = type === 'slime' || type === 'magma_blob' ? this.size * this.size * 4 : info.hp;
    this.health = this.maxHealth;
    this.hostile = HOSTILE.has(type) && !info.neutral;
    this.angry = false;
    this.hurtTime = 0; this.deathTime = 0;
    this.attackCooldown = 0;
    this.wanderTarget = null; this.wanderTimer = Math.random() * 5;
    this.panic = 0;
    this.walkPhase = 0;
    this.fuse = 0;
    this.love = 0; this.breedCooldown = 0; this.growTimer = this.baby ? 300 : 0;
    this.sheared = false; this.woolColor = opts.woolColor ?? 'white';
    this.tamed = false; this.owner = null; this.sitting = false;
    this.eggTimer = 60 + Math.random() * 120;
    this.stepHeight = 0.6;
    if (type === 'ender_dragon') this.stepHeight = 0;
    const modelScale = (type === 'ghast' ? 4 : type === 'ender_dragon' ? 1 : sc) * (info.scale ?? 1) * (type === 'magma_blob' ? this.size / 2 : 1);
    const { root, parts, mats } = buildModel(type, modelScale);
    if (info.tint) for (const pv of Object.values(parts)) if (pv.userData.mesh) pv.userData.mesh.userData.tint = info.tint;
    this.model = root; this.parts = parts; this.mats = mats;
    this.mesh.add(root);
    if (type === 'sheep' && this.woolColor !== 'white') this.setWool(this.woolColor);
    if ((type === 'skeleton') && parts.arm1) {
      const bow = makeSpriteMesh(I.bow, 0.7); bow.position.set(0, -0.6, 0.15); bow.rotation.set(0, Math.PI / 2, 0); parts.arm1.add(bow);
    }
    if (type === 'zombified_piglin' && parts.arm1) {
      const sw = makeSpriteMesh(I.golden_sword, 0.7); sw.position.set(0, -0.7, 0.2); sw.rotation.set(0, Math.PI / 2, -0.8); parts.arm1.add(sw);
    }
    this.yaw = Math.random() * Math.PI * 2;
    this.headYaw = 0;
  }
  setWool(color) {
    this.woolColor = color;
    const m = this.parts.body?.userData.mesh;
    if (!m) return;
    const map = { white: 0xe9ecec, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c627, lime: 0x70b919, pink: 0xed8dac, gray: 0x3e4447, light_gray: 0x8e8e86, cyan: 0x158991, purple: 0x792aac, blue: 0x35399d, brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519 };
    m.userData.tint = map[color] ?? 0xffffff;
  }
  shear() {
    if (this.sheared || this.baby) return false;
    this.sheared = true;
    const m = this.parts.body.userData.mesh;
    m.scale.set(0.8, 0.8, 0.9);
    m.userData.tint = 0xd8c0b0;
    this.game.spawnItem(this.pos.x, this.pos.y + 1, this.pos.z, { id: I[this.woolColor + '_wool'], count: 1 + ((Math.random() * 3) | 0) });
    return true;
  }
  hurt(amount, source, dir) {
    if (this.dead || this.hurtTime > 0.35) return false;
    this.health -= amount;
    this.hurtTime = 0.5;
    this.game.sfx('hurt_mob', this.pos.x, this.pos.y, this.pos.z);
    const kb = this.type === 'ender_dragon' ? 0 : this.type === 'iron_golem' ? 0.2 : 1;
    if (dir) { this.vel.x += dir.x * 7 * kb; this.vel.z += dir.z * 7 * kb; if (this.onGround) this.vel.y = 5 * kb; }
    else if (source && source.pos) { const d = this.pos.clone().sub(source.pos).setY(0).normalize(); this.vel.x += d.x * 7 * kb; this.vel.z += d.z * 7 * kb; if (this.onGround) this.vel.y = 5 * kb; }
    if (this.info.passive && !this.info.neutral) this.panic = 5;
    if (source === this.game.player || source?.owner === this.game.player) {
      this.lastAttackedByPlayer = true;
      if (this.info.neutral || this.hostile) { this.angry = true; this.target = this.game.player; }
      if (this.type === 'zombified_piglin') for (const e of this.game.entities) if (e instanceof Mob && e.type === 'zombified_piglin' && e.pos.distanceTo(this.pos) < 24) { e.angry = true; e.target = this.game.player; }
      this.game.player.lastHurtMob = this;
      if (this.type === 'villager') {
        this.rep = (this.rep ?? 0) - 10;
        for (const e of this.game.entities) if (e instanceof Mob && !e.dead && e.pos.distanceTo(this.pos) < 24) {
          if (e.type === 'iron_golem') { e.angry = true; e.target = this.game.player; }
          if (e.type === 'villager' && e !== this) e.rep = (e.rep ?? 0) - 3;
        }
        this.panic = 5;
      }
    } else if (source instanceof Mob) { this.target = source; this.angry = true; }
    // zombies turn the villagers they kill into zombie villagers
    if (this.type === 'villager' && this.health <= 0 && source instanceof Mob && (source.type === 'zombie' || source.type === 'zombie_villager') && Math.random() < (this.game.difficulty === 'hard' ? 1 : this.game.difficulty === 'normal' ? 0.5 : 0)) {
      this.remove = true; this.dead = true;
      const z = this.game.spawnMob('zombie_villager', this.pos.x, this.pos.y, this.pos.z);
      if (z) z.villagerData = this.villagerSnapshot();
      return true;
    }
    if (this.type === 'enderman' && Math.random() < 0.7) this.teleport();
    if (this.health <= 0) this.die(source);
    return true;
  }
  die(source) {
    this.dead = true; this.deathTime = 0;
    this.game.sfx('death_mob', this.pos.x, this.pos.y, this.pos.z);
    if (this.baby) return;
    const fire = this.fire > 0;
    for (const [name, a, b] of this.info.drops) {
      let n = a + Math.floor(Math.random() * (b - a + 1 + (this.looting ?? 0)));
      let id = I[name];
      if (fire && I['cooked_' + name]) id = I['cooked_' + name];
      if (name === 'beef' && fire) id = I.cooked_beef;
      if (n > 0) this.game.spawnItem(this.pos.x, this.pos.y + 0.5, this.pos.z, { id, count: n });
    }
    if (this.type === 'sheep' && !this.sheared) this.game.spawnItem(this.pos.x, this.pos.y + 0.5, this.pos.z, { id: I[this.woolColor + '_wool'], count: 1 });
    for (const [name, chance] of this.info.rare ?? []) if (Math.random() < chance) this.game.spawnItem(this.pos.x, this.pos.y + 0.5, this.pos.z, { id: I[name], count: 1 });
    if (this.type === 'slime' && this.size > 1) for (let i = 0; i < 2 + ((Math.random() * 2) | 0); i++) this.game.spawnMob('slime', this.pos.x + (Math.random() - 0.5), this.pos.y + 0.5, this.pos.z + (Math.random() - 0.5), { size: this.size / 2 });
    if (this.lastAttackedByPlayer || source === this.game.player) this.game.spawnXP(this.pos.x, this.pos.y + 0.5, this.pos.z, this.info.xp);
    if (this.type === 'ender_dragon') this.game.onDragonDeath(this);
  }
  makeNameLabel() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 40;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 256, 40);
    g.fillStyle = '#fff'; g.font = 'bold 26px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(this.customName.slice(0, 18), 128, 21);
    const tex = new THREE.CanvasTexture(c);
    this.nameLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.nameLabel.scale.set(1.6, 0.25, 1);
    this.nameLabel.position.y = this.h + 0.45;
    this.mesh.add(this.nameLabel);
  }
  villagerSnapshot() { return { profession: this.profession, vlevel: this.vlevel, vxp: this.vxp, offers: this.offers, rep: this.rep, home: this.home }; }
  villagerTick(dt) {
    const g = this.game, w = this.world;
    this.jobTimer = (this.jobTimer ?? Math.random() * 3) - dt;
    if (this.jobTimer <= 0) {
      this.jobTimer = 3;
      // lose the job if the work station is gone (only while still a novice without trades used)
      if (this.jobPos && !JOB_BLOCK[BLOCKS[w.getBlock(...this.jobPos)]?.name] && w.isLoaded(this.jobPos[0], this.jobPos[2])) {
        g.jobClaims?.delete(this.jobPos.join(','));
        this.jobPos = null;
        if (this.vlevel === 1 && this.vxp === 0) { this.profession = null; this.offers = []; this.applyRobe(); }
      }
      if (!this.profession && !this.nitwit) {
        const x0 = Math.floor(this.pos.x), y0 = Math.floor(this.pos.y), z0 = Math.floor(this.pos.z);
        outer: for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) for (let dy = -2; dy <= 3; dy++) {
          const id = w.getBlock(x0 + dx, y0 + dy, z0 + dz);
          const prof = JOB_BLOCK[BLOCKS[id]?.name];
          if (!prof) continue;
          const key = `${x0 + dx},${y0 + dy},${z0 + dz}`;
          if (g.jobClaims?.has(key) && g.jobClaims.get(key) !== this.id) continue;
          (g.jobClaims ??= new Map()).set(key, this.id);
          this.jobPos = [x0 + dx, y0 + dy, z0 + dz];
          initVillager(this, prof);
          this.applyRobe();
          g.particles?.burst(this.pos.x, this.pos.y + 2, this.pos.z, 0x60ff60);
          break outer;
        }
      }
      // restock twice a day near the job site
      const day = Math.floor((g.time + 6000) / 12000);
      if (this.profession && this.lastRestock !== day && this.jobPos && this.pos.distanceTo(new THREE.Vector3(...this.jobPos)) < 6) { this.lastRestock = day; restock(this); }
    }
    if (this.leveledUp > 0) { this.leveledUp -= dt; if (Math.random() < dt * 8) g.particles?.burst(this.pos.x, this.pos.y + 2.2, this.pos.z, 0x40ff40); }
    // wander toward the job site during work hours
    const tday = g.time % 24000;
    if (this.jobPos && tday > 2000 && tday < 9000 && !this.wanderTarget && Math.random() < dt * 0.3) this.wanderTarget = new THREE.Vector3(this.jobPos[0] + 0.5, this.pos.y, this.jobPos[2] + 0.5);
  }
  applyRobe() {
    const prof = PROFESSIONS[this.profession];
    const set = (n, col) => { const m = this.parts[n]?.userData.mesh; if (m) m.userData.tint = col; };
    if (prof) { set('body', prof.robe); set('robe', prof.robe); set('hood', prof.hat); set('arms', prof.robe); }
    else { for (const n of ['body', 'robe', 'hood', 'arms']) { const m = this.parts[n]?.userData.mesh; if (m) delete m.userData.tint; } }
  }
  // swimming creatures stay in water; out of it they flop and eventually suffocate
  aquaticAI(dt, p) {
    const w = this.world;
    const inW = this.inWater || w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z)) === B.water;
    if (!inW) {
      this.dry = (this.dry ?? 0) + dt;
      if (this.onGround && Math.random() < dt * 3) { this.vel.y = 5; this.vel.x = (Math.random() - 0.5) * 3; this.vel.z = (Math.random() - 0.5) * 3; }
      if (this.dry > 15 && Math.random() < dt) this.hurt(1, null);
      this.physics(dt);
    } else {
      this.dry = 0;
      let goal = this.swimTarget;
      const hostile = this.hostile || this.angry;
      if (hostile && p.mode === 'survival' && !p.dead && p.pos.distanceTo(this.pos) < 16) {
        goal = p.pos.clone().add(new THREE.Vector3(0, 1, 0));
        if (this.info.ranged && this.attackCooldown <= 0 && this.canSee(p)) { this.shoot(p, this.info.ranged); this.attackCooldown = 3; }
        else if (!this.info.ranged && this.pos.distanceTo(goal) < 1.5 && this.attackCooldown <= 0) { p.hurt(this.info.damage ?? 2, this); this.attackCooldown = 1; }
      } else if (this.panic > 0 && p.pos.distanceTo(this.pos) < 10) { this.panic -= dt; goal = this.pos.clone().add(this.pos.clone().sub(p.pos).normalize().multiplyScalar(6)); }
      if (!goal || this.pos.distanceTo(goal) < 1 || Math.random() < dt * 0.15) {
        goal = this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 12));
        if (w.getBlock(Math.floor(goal.x), Math.floor(goal.y), Math.floor(goal.z)) !== B.water) goal = null;
        this.swimTarget = goal;
      }
      if (goal) {
        const d = goal.clone().sub(this.pos); const len = d.length();
        if (len > 0.1) { d.multiplyScalar(this.info.speed / len); this.vel.lerp(d, Math.min(1, dt * 2)); this.yaw = Math.atan2(this.vel.x, this.vel.z); }
      } else this.vel.multiplyScalar(Math.pow(0.3, dt));
      // stay below the surface
      if (w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + this.h + 0.2), Math.floor(this.pos.z)) !== B.water && this.vel.y > 0) this.vel.y = this.type === 'dolphin' && Math.random() < 0.01 ? 8 : -0.5;
      moveEntity(this, w, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, 0);
    }
    for (const [n, pv] of Object.entries(this.parts)) {
      if (n.startsWith('tent')) pv.rotation.x = Math.sin(this.age * 3 + Number(n.slice(4))) * 0.4;
      if (n === 'tail') pv.rotation.y = Math.sin(this.age * 10) * 0.4;
      if (n.startsWith('seg')) pv.position.x = Math.sin(this.age * 6 - Number(n.slice(3))) * 0.08 * Number(n.slice(3));
    }
    this.animateCommon();
  }
  // floating sentinel: turns its shell toward the player and fires levitation bolts
  sentinelAI(dt, p) {
    const d = p.pos.distanceTo(this.pos);
    const open = p.mode === 'survival' && d < 16 && this.canSee(p);
    this.parts.ring && (this.parts.ring.rotation.y += dt * (open ? 3 : 0.5));
    if (this.parts.core) this.parts.core.position.y = (open ? 8 : 6) / 16 + Math.sin(this.age * 2) * 0.03;
    if (open && this.attackCooldown <= 0) { this.shoot(p, 'levitation_bolt'); this.attackCooldown = 2 + Math.random() * 2; }
    if (this.hurtTime > 0.45 && Math.random() < 0.3) this.teleport();
    this.vel.set(0, 0, 0);
    this.animateCommon();
  }
  // gentle wandering flight for birds and insects
  passiveFly(dt) {
    if (!this.flyGoal || this.pos.distanceTo(this.flyGoal) < 1 || Math.random() < dt * 0.2) {
      const surf = this.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z));
      this.flyGoal = new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * 12, Math.max(surf + 1.5, this.pos.y + (Math.random() - 0.5) * 4), this.pos.z + (Math.random() - 0.5) * 12);
      if (Math.random() < 0.3 && this.tamed && this.owner) this.flyGoal = this.owner.pos.clone().add(new THREE.Vector3(0, 2.2, 0));
    }
    const d = this.flyGoal.clone().sub(this.pos); const len = d.length();
    if (len > 0.1) d.multiplyScalar(Math.min(this.info.speed, len * 2) / len);
    this.vel.lerp(d, Math.min(1, dt * 2));
    moveEntity(this, this.world, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, 0);
    if (this.collidedH) this.flyGoal = null;
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    const flap = Math.sin(this.age * 30) * 0.8;
    if (this.parts.wing0) { this.parts.wing0.rotation.z = flap; this.parts.wing1.rotation.z = -flap; }
    this.animateCommon();
    return true;
  }
  // night wraith: circles high above, then swoops down on its target
  wraithAI(dt, tgt) {
    this.swoopT = (this.swoopT ?? 4) - dt;
    let goal;
    if (this.swoopT > 0) { const a = this.age * 0.8; goal = tgt.pos.clone().add(new THREE.Vector3(Math.cos(a) * 10, 12, Math.sin(a) * 10)); }
    else { goal = tgt.pos.clone().add(new THREE.Vector3(0, 1, 0)); if (this.pos.distanceTo(goal) < 1.5) { if (this.attackCooldown <= 0) { tgt.hurt(this.info.damage, this); this.attackCooldown = 1; } this.swoopT = 5 + Math.random() * 4; } }
    const d = goal.sub(this.pos).normalize().multiplyScalar(this.swoopT > 0 ? 6 : 11);
    this.vel.lerp(d, Math.min(1, dt * 2));
    moveEntity(this, this.world, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, 0);
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    const flap = Math.sin(this.age * 6) * 0.5;
    if (this.parts.wing0) { this.parts.wing0.rotation.z = flap; this.parts.wing1.rotation.z = -flap; }
    this.animateCommon();
  }
  applyPotion(effects) {
    const undead = ['zombie', 'skeleton', 'zombified_piglin', 'husk', 'drowned', 'stray', 'wither_skeleton', 'phantom', 'wither', 'zoglin'].includes(this.type);
    for (const ef of effects) {
      let e = ef.e;
      if (undead && e === 'instant_health') e = 'instant_damage'; else if (undead && e === 'instant_damage') e = 'instant_health';
      if (e === 'instant_health') this.health = Math.min(this.maxHealth, this.health + (4 << ef.a));
      else if (e === 'instant_damage') { this.hurtTime = 0; this.hurt(6 << ef.a, null); }
      else if (e === 'poison' && !undead) this.poison = Math.max(this.poison ?? 0, ef.t);
      else if (e === 'slowness') this.slowFor = Math.max(this.slowFor ?? 0, ef.t);
      else if (e === 'weakness') this.weakFor = Math.max(this.weakFor ?? 0, ef.t);
      else if (e === 'speed') this.fastFor = Math.max(this.fastFor ?? 0, ef.t);
    }
  }
  teleport() {
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(this.pos.x + (Math.random() - 0.5) * 32), z = Math.floor(this.pos.z + (Math.random() - 0.5) * 32);
      if (!this.world.isLoaded(x, z)) continue;
      for (let y = Math.floor(this.pos.y) + 8; y > Math.floor(this.pos.y) - 8; y--) {
        if (SOLID[this.world.getBlock(x, y - 1, z)] && !this.world.getBlock(x, y, z) && !this.world.getBlock(x, y + 1, z) && !this.world.getBlock(x, y + 2, z)) {
          this.pos.set(x + 0.5, y, z + 0.5); this.game.sfx('teleport'); return;
        }
      }
    }
  }

  update(dt) {
    super.update(dt);
    const p = this.game.player;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    // flames on burning mobs
    const burning = this.fire > 0 && !this.inWater && !this.info.fireImmune;
    if (burning && !this.fireMesh) { this.fireMesh = makeFireShell(worldUniforms, this.w, this.h); this.mesh.add(this.fireMesh); }
    if (this.fireMesh) {
      this.fireMesh.visible = burning;
      if (burning && Math.random() < dt * 5) this.game.particles?.spawn(this.pos.x + (Math.random() - 0.5) * this.w, this.pos.y + this.h * (0.6 + Math.random() * 0.5), this.pos.z + (Math.random() - 0.5) * this.w, new THREE.Color(0x404040), new THREE.Vector3(0, 0.8, 0), 1, 0.1, -0.2, { drag: 0.6, grow: true, collide: false });
    }
    if (this.dead) {
      this.deathTime += dt;
      this.model.rotation.z = Math.min(Math.PI / 2, this.deathTime * 4);
      setTint(this.mats, 1, 0.3, 0.3);
      if (this.deathTime > (this.type === 'ender_dragon' ? 4 : 1)) { this.remove = true; this.game.particles?.poof(this.pos.x, this.pos.y, this.pos.z, this.info.w, this.info.h); }
      if (this.type === 'ender_dragon') { this.pos.y += dt * 6; this.model.rotation.z = 0; this.model.rotation.y += dt * 2; }
      return;
    }
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.poison > 0) { this.poison -= dt; this.poisonAcc = (this.poisonAcc ?? 0) + dt; if (this.poisonAcc > 1.25 && this.health > 1) { this.poisonAcc = 0; this.hurtTime = 0; this.hurt(1, null); } }
    if (this.slowFor > 0) this.slowFor -= dt;
    if (this.fastFor > 0) this.fastFor -= dt;
    if (this.growTimer > 0) { this.growTimer -= dt; if (this.growTimer <= 0 && this.baby) this.growUp(); }
    if (this.love > 0) this.love -= dt;
    if (this.breedCooldown > 0) this.breedCooldown -= dt;
    // environment damage
    if (this.inLava && !this.info.fireImmune) { this.fire = 8; this.hurt(4, null); }
    if (this.fire > 0) { this.fire -= dt; if (!this.info.fireImmune && Math.random() < dt) this.hurt(1, null); if (this.inWater) this.fire = 0; }
    if (this.info.burns && this.game.world.hasSky && this.game.daylightLevel > 0.5 && !this.inWater && !this.baby && !(this.game.weather?.rain > 0.3)) {
      const l = this.world.getLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.6), Math.floor(this.pos.z));
      if ((l >> 4) >= 15) this.fire = Math.max(this.fire, 3);
    }
    if (this.pos.y < -40) { this.health = 0; this.die(null); return; }
    if (this.type === 'enderman' && this.inWater) this.teleport();
    if (this.type === 'villager') this.villagerTick(dt);
    if (this.info.barters && !this.angry) {
      if (this.bartering > 0) { this.bartering -= dt; if (this.bartering <= 0) { const loot = [['ender_pearl', 1, 2], ['string', 3, 9], ['fire_charge_dummy', 1, 1], ['obsidian', 1, 1], ['crying_obsidian', 1, 3], ['gravel', 8, 16], ['leather', 2, 4], ['nether_brick', 2, 8], ['soul_sand', 2, 8], ['quartz', 5, 12], ['glowstone_dust', 5, 12], ['magma_cream', 2, 6], ['potion', 1, 1]]; const [n, a, b2] = loot[Math.floor(Math.random() * loot.length)]; if (I[n] != null) this.game.spawnItem(this.pos.x, this.pos.y + 1, this.pos.z, { id: I[n], count: a + Math.floor(Math.random() * (b2 - a + 1)), dmg: 0, data: n === 'potion' ? { potion: 'fire_resistance' } : undefined }); this.game.sfx('trade'); } }
      else for (const e of this.game.entities) if (e.stack && !e.remove && e.stack.id === I.gold_ingot && e.pos.distanceTo(this.pos) < 2) { e.stack.count--; if (e.stack.count <= 0) e.remove = true; this.bartering = 3; break; }
    }
    if (this.type === 'zombie_villager' && this.curing > 0) {
      this.curing -= dt;
      if (Math.random() < dt * 6) this.game.particles?.burst(this.pos.x, this.pos.y + 1.5, this.pos.z, 0xff60a0);
      if (this.curing <= 0) {
        this.remove = true; this.dead = true;
        const v = this.game.spawnMob('villager', this.pos.x, this.pos.y, this.pos.z);
        if (v && this.villagerData) Object.assign(v, this.villagerData);
        if (v) { v.rep = (v.rep ?? 0) + 50; v.applyRobe(); }
        this.game.sfx('levelup'); this.game.achieve('Doctor zombi');
        return;
      }
    }
    // AI
    let moveDir = null, speed = this.info.speed * (this.slowFor > 0 ? 0.6 : 1) * (this.fastFor > 0 ? 1.4 : 1), wantJump = false;
    const toPlayer = p.pos.clone().sub(this.pos);
    const distP = toPlayer.length();
    const playerTargetable = p.mode === 'survival' && !p.dead;

    if (this.type === 'ender_dragon') return this.dragonAI(dt, p);
    if (this.info.aquatic) return this.aquaticAI(dt, p);
    if (this.info.stationary) return this.sentinelAI(dt, p);
    if (this.info.flier && !this.target && !(this.angry && this.hostile)) { if (this.passiveFly(dt)) return; }
    if (this.type === 'creeper') { const cat = this.game.entities.find((e) => e.type === 'cat' && !e.dead && e.pos.distanceTo(this.pos) < 6); if (cat) { const away = this.pos.clone().sub(cat.pos).setY(0).normalize(); this.vel.x = away.x * 4; this.vel.z = away.z * 4; this.fuse = 0; this.target = null; } }
    if (this.type === 'night_wraith' && this.target) return this.wraithAI(dt, this.target);
    if (this.info.lavaWalker) { const below = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z)); if (below === B.lava || this.inLava) { this.vel.y = Math.max(this.vel.y, 0); this.pos.y = Math.max(this.pos.y, Math.floor(this.pos.y - 0.1) + 1); this.onGround = true; } }
    if (p.vehicle === this) {
      // ridden: horses follow the rider's input, pigs follow a carrot on a stick
      const inp = this.game.input();
      const ctrl = this.type === 'horse' ? this.tamed && this.saddled : this.type === 'pig' && p.heldItem() && ITEMS[p.heldItem().id].name === 'carrot_on_a_stick';
      if (ctrl) {
        this.yaw = p.yaw + Math.PI;
        let f = (inp.forward ? 1 : 0) - (inp.back ? 0.4 : 0);
        if (inp.analog) f = Math.max(-0.4, Math.min(1, -(inp.az ?? 0)));
        const sp = this.type === 'horse' ? 9 : 3;
        const dx = -Math.sin(p.yaw) * f * sp, dz = -Math.cos(p.yaw) * f * sp;
        this.vel.x += (dx - this.vel.x) * Math.min(1, dt * 6); this.vel.z += (dz - this.vel.z) * Math.min(1, dt * 6);
        if (inp.jump && this.onGround && this.type === 'horse') this.vel.y = 11;
        if (this.collidedH && this.onGround) this.vel.y = 8.4;
      }
      this.physics(dt);
      this.animate(dt, Math.hypot(this.vel.x, this.vel.z));
      return;
    }

    if (this.hostile || this.angry) {
      if (!this.target || this.target.dead || this.target.remove) this.target = null;
      if (!this.target && playerTargetable && (this.angry || (distP < 16 && this.canSee(p)))) this.target = p;
      if (this.target === p && (!playerTargetable || distP > 40)) { this.target = null; if (!this.hostile) this.angry = false; }
      if (this.type === 'spider' && !this.angry && this.game.daylightLevel > 0.6 && this.target === p) this.target = null;
    }
    if (this.type === 'enderman' && !this.angry && playerTargetable && distP < 40) {
      // stare check
      const look = p.lookDir();
      const toHead = this.pos.clone().add(new THREE.Vector3(0, 2.6, 0)).sub(p.eyePos()).normalize();
      if (look.dot(toHead) > 0.995 && this.canSee(p)) { this.angry = true; this.target = p; this.game.sfx('teleport'); }
    }
    if (this.tamed && this.owner) {
      const tgt = p.lastHurtMob && !p.lastHurtMob.dead && p.lastHurtMob !== this ? p.lastHurtMob : null;
      if (tgt && tgt.pos.distanceTo(this.pos) < 20) this.target = tgt; else this.target = null;
      if (!this.target && !this.sitting) {
        if (distP > 24) { this.pos.copy(p.pos); this.vel.set(0, 0, 0); }
        else if (distP > 4) { moveDir = toPlayer.clone().setY(0).normalize(); speed *= 1.2; }
      }
      if (this.sitting) { moveDir = null; this.target = null; }
    }

    const tgt = this.target;
    if (tgt && !tgt.dead) {
      const to = tgt.pos.clone().sub(this.pos);
      const d = to.length();
      this.yaw = Math.atan2(to.x, to.z);
      if (this.info.flying) return this.flyingAI(dt, tgt, to, d);
      if (this.info.ranged) {
        if (d > 7) moveDir = to.clone().setY(0).normalize();
        else if (d < 4) moveDir = to.clone().setY(0).normalize().negate();
        if (this.attackCooldown <= 0 && d < 16 && this.canSee(tgt)) { this.shoot(tgt, this.info.ranged); this.attackCooldown = this.info.ranged === 'potion' ? 3 : 2; }
      } else if (this.type === 'creeper') {
        if (d < 3 && this.canSee(tgt)) { this.fuse += dt; if (this.fuse > 0.1 && Math.floor(this.fuse * 10) % 5 === 0) this.game.sfx('fuse'); }
        else { this.fuse = Math.max(0, this.fuse - dt); moveDir = to.clone().setY(0).normalize(); }
        if (this.fuse >= 1.5) { this.remove = true; this.dead = true; this.game.explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 3, false); return; }
      } else {
        moveDir = to.clone().setY(0).normalize();
        if (this.type === 'spider' && d < 4 && d > 2 && this.onGround) { this.vel.y = 7; this.vel.x += moveDir.x * 3; this.vel.z += moveDir.z * 3; }
        if (this.info.hops && this.onGround && Math.random() < dt * 3) { this.vel.y = 6; }
        if (this.type === 'slime' || this.info.slimeLike) { if (this.onGround) { if (this.attackCooldown <= 0) { this.vel.y = 8; this.vel.x = moveDir.x * 4; this.vel.z = moveDir.z * 4; this.attackCooldown = 1.2; } moveDir = null; } }
        const reach = this.w / 2 + tgt.w / 2 + 0.6;
        if (Math.hypot(to.x, to.z) < reach && Math.abs(to.y) < 2 && this.attackCooldown <= 0) {
          const dmg = (this.info.damage ?? 2) * (this.game.difficultyMul ?? 1);
          tgt.hurt(this.info.slimeLike || this.type === 'slime' ? this.size * 1.5 : dmg, this, to.clone().normalize());
          const oh = this.info.onHit;
          if (oh && tgt.addEffect) { if (oh === 'poison') tgt.addEffect('poison', this.game.difficulty === 'hard' ? 15 : 7, 0); if (oh === 'wither') tgt.addEffect('wither', 10, 0); if (oh === 'hunger') tgt.addEffect('hunger', 7, 0); }
          if (this.info.knock) tgt.vel.y += 6 * this.info.knock;
          if (this.type === 'bee') { this.angry = false; this.target = null; this.stung = true; this.health = Math.min(this.health, 2); }
          this.attackCooldown = 1;
          if (this.type === 'iron_golem') tgt.vel.y += 8;
        }
      }
    } else {
      this.fuse = Math.max(0, this.fuse - dt);
      if (this.info.flying) return this.flyingAI(dt, null);
      // passive behaviour: panic, follow food, breed, wander
      if (this.panic > 0) { this.panic -= dt; speed *= 1.8; if (!this.wanderTarget || Math.random() < dt) this.pickWander(8); }
      const held = p.heldItem();
      if (this.info.food && held && this.info.food.includes(ITEMS[held.id]?.name) && distP < 8 && !this.panic) {
        moveDir = toPlayer.clone().setY(0); if (moveDir.length() > 2) moveDir.normalize(); else moveDir = null;
        this.yaw = Math.atan2(toPlayer.x, toPlayer.z);
      } else if (this.love > 0) {
        const mate = this.game.entities.find((e) => e !== this && e instanceof Mob && e.type === this.type && e.love > 0 && !e.baby && e.pos.distanceTo(this.pos) < 8);
        if (mate) {
          const to = mate.pos.clone().sub(this.pos);
          if (to.length() < 1.5) { this.love = 0; mate.love = 0; this.breedCooldown = mate.breedCooldown = 300; this.game.spawnMob(this.type, this.pos.x, this.pos.y, this.pos.z, { baby: true }); p.addXP(3); }
          else moveDir = to.setY(0).normalize();
        }
      }
      if (!moveDir) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) { this.wanderTimer = 3 + Math.random() * 8; if (Math.random() < 0.6) this.pickWander(10); else this.wanderTarget = null; }
        if (this.wanderTarget) {
          const to = this.wanderTarget.clone().sub(this.pos).setY(0);
          if (to.length() < 0.8) this.wanderTarget = null; else { moveDir = to.normalize(); speed *= this.panic > 0 ? 1 : 0.55; }
        }
      }
      if (this.type === 'chicken') { this.eggTimer -= dt; if (this.eggTimer <= 0 && !this.baby) { this.eggTimer = 120 + Math.random() * 120; this.game.spawnItem(this.pos.x, this.pos.y + 0.3, this.pos.z, { id: I.egg, count: 1 }); } if (!this.onGround && this.vel.y < -2) this.vel.y = -2; }
      if (this.type === 'sheep' && this.sheared && Math.random() < dt * 0.02) {
        const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y) - 1, bz = Math.floor(this.pos.z);
        if (this.world.getBlock(bx, by, bz) === B.grass_block) { this.world.setBlock(bx, by, bz, B.dirt); this.sheared = false; const m = this.parts.body.userData.mesh; m.scale.set(1, 1, 1); this.setWool(this.woolColor); }
      }
    }
    if (moveDir) {
      if (!tgt) this.yaw = Math.atan2(moveDir.x, moveDir.z);
      const accel = this.onGround ? 1 : 0.3;
      this.vel.x += (moveDir.x * speed - this.vel.x) * Math.min(1, dt * 10 * accel);
      this.vel.z += (moveDir.z * speed - this.vel.z) * Math.min(1, dt * 10 * accel);
      if (this.collidedH && this.onGround) wantJump = true;
      if (this.info.hops && this.onGround) this.vel.y = Math.max(this.vel.y, 5);
      if (this.collidedH && this.info.climbs) this.vel.y = 3;
      if (this.inWater) this.vel.y = Math.max(this.vel.y, 2.5);
      // avoid cliffs when wandering
      if (!tgt && this.onGround) {
        const ax = Math.floor(this.pos.x + moveDir.x * 0.8), az = Math.floor(this.pos.z + moveDir.z * 0.8);
        let drop = 0; for (let k = 1; k <= 4; k++) { if (SOLID[this.world.getBlock(ax, Math.floor(this.pos.y) - k, az)]) break; drop++; }
        if (drop >= 4 || this.world.getBlock(ax, Math.floor(this.pos.y), az) === B.lava || this.world.getBlock(ax, Math.floor(this.pos.y) - 1, az) === B.lava) { this.vel.x = 0; this.vel.z = 0; this.wanderTarget = null; }
      }
    } else if (this.inWater) this.vel.y = Math.max(this.vel.y, 1.5);
    if (wantJump) this.vel.y = 8.4;
    this.physics(dt);
    // fall damage
    if (!this.onGround && this.vel.y < 0 && this.fallStart == null) this.fallStart = this.pos.y;
    if (this.onGround || this.inWater) {
      if (this.fallStart != null && !this.info.flying && this.type !== 'chicken') { const fd = this.fallStart - this.pos.y - 3; if (fd > 0 && !this.inWater) this.hurt(Math.ceil(fd), null); }
      this.fallStart = null;
    }
    if (this.vel.y > 0) this.fallStart = null;
    this.animate(dt, Math.hypot(this.vel.x, this.vel.z));
  }

  growUp() {
    this.baby = false;
    const info = this.info;
    this.w = info.w; this.h = info.h;
    this.model.scale.setScalar(1);
  }

  pickWander(r) {
    const x = this.pos.x + (Math.random() - 0.5) * 2 * r, z = this.pos.z + (Math.random() - 0.5) * 2 * r;
    this.wanderTarget = new THREE.Vector3(x, this.pos.y, z);
  }

  canSee(e) {
    const from = this.pos.clone().add(new THREE.Vector3(0, this.h * 0.85, 0));
    const to = e.pos.clone().add(new THREE.Vector3(0, e.h * 0.85, 0));
    const d = to.clone().sub(from);
    const len = d.length();
    if (len < 0.01) return true;
    const hit = this.world.raycast(from, d.normalize(), len);
    return !hit || !BLOCKS[hit.id].opaque;
  }

  shoot(tgt, kind) {
    const from = this.pos.clone().add(new THREE.Vector3(0, this.h * (kind === 'fireball' ? 0.5 : 0.85), 0));
    const to = tgt.pos.clone().add(new THREE.Vector3(0, tgt.h * 0.6, 0));
    const d = to.sub(from);
    const dist = d.length();
    if (kind === 'ash_skull' || kind === 'levitation_bolt' || kind === 'water_bolt' || kind === 'spit') this.game.sfx(kind === 'spit' ? 'throw' : 'fireball');
    const speed = kind === 'levitation_bolt' ? 8 : kind === 'water_bolt' ? 20 : kind === 'spit' ? 18 : kind === 'ash_skull' ? 16 : kind === 'arrow' ? 32 : kind === 'fireball' ? 14 : kind === 'small_fireball' ? 18 : 14;
    if (kind === 'arrow' || kind === 'potion') d.y += dist * 0.12;
    d.normalize();
    if (kind === 'arrow') d.add(new THREE.Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06)).normalize();
    from.add(d.clone().multiplyScalar(kind === 'fireball' ? 2.5 : 0.6));
    const shots = kind === 'small_fireball' ? 3 : 1;
    for (let i = 0; i < shots; i++) {
      const v = d.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1 * i, 0, (Math.random() - 0.5) * 0.1 * i)).normalize().multiplyScalar(speed);
      const pr = new Projectile(this.game, kind, from.clone(), v, this);
      if (kind === 'potion') pr.potion = ['harming', 'poison', 'slowness', 'weakness'][Math.floor(Math.random() * 4)];
      this.game.addEntity(pr);
    }
    this.game.sfx(kind === 'arrow' ? 'bow' : 'fireball');
  }

  flyingAI(dt, tgt, to, d) {
    const t = this.age;
    if (!this.hoverTarget || Math.random() < dt * 0.2) {
      const base = tgt ? tgt.pos : this.pos;
      const surf = this.type === 'ghast' ? 8 : 3;
      this.hoverTarget = new THREE.Vector3(base.x + (Math.random() - 0.5) * 20, (tgt ? tgt.pos.y : this.pos.y) + surf + Math.random() * 4, base.z + (Math.random() - 0.5) * 20);
    }
    const dir = this.hoverTarget.clone().sub(this.pos);
    if (dir.length() > 1) dir.normalize().multiplyScalar(this.info.speed);
    this.vel.lerp(dir, Math.min(1, dt * 2));
    moveEntity(this, this.world, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, 0);
    if (this.collidedH) this.hoverTarget = null;
    if (tgt && d < 48 && this.attackCooldown <= 0 && this.canSee(tgt)) {
      this.shoot(tgt, this.info.ranged);
      this.attackCooldown = this.type === 'ghast' ? 3 + Math.random() * 2 : 3;
    }
    if (tgt) this.yaw = Math.atan2(to.x, to.z);
    // tentacles / rods
    for (const [n, pv] of Object.entries(this.parts)) {
      if (n.startsWith('tent')) pv.rotation.x = Math.sin(t * 2 + n.length * 1.3 + Number(n.slice(4))) * 0.3;
      if (n.startsWith('rod')) { const i = Number(n.slice(3)); const r = i < 4 ? 0.5 : 0.32; const a = t * (i < 4 ? 1.5 : -2) + i * Math.PI / 2; pv.position.set(Math.cos(a) * r, (i < 4 ? 14 : 6) / 16 + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * r); }
    }
    this.animateCommon();
  }

  dragonAI(dt, p) {
    const t = this.age;
    this.dragonPhase = this.dragonPhase ?? 'circle';
    this.phaseTimer = (this.phaseTimer ?? 10) - dt;
    let goal;
    if (this.dragonPhase === 'circle') {
      const a = t * 0.25;
      goal = new THREE.Vector3(Math.cos(a) * 50, 85 + Math.sin(t * 0.5) * 8, Math.sin(a) * 50);
      if (this.phaseTimer <= 0 && p.mode === 'survival') { this.dragonPhase = 'swoop'; this.phaseTimer = 6; }
      if (this.attackCooldown <= 0 && p.mode === 'survival' && this.pos.distanceTo(p.pos) < 80) { this.shoot(p, 'fireball'); this.attackCooldown = 6; }
    } else {
      goal = p.pos.clone().add(new THREE.Vector3(0, 1, 0));
      if (this.phaseTimer <= 0 || this.pos.distanceTo(goal) < 3) { this.dragonPhase = 'circle'; this.phaseTimer = 12 + Math.random() * 10; }
    }
    const dir = goal.sub(this.pos);
    const dist = dir.length();
    dir.normalize().multiplyScalar(this.dragonPhase === 'swoop' ? 16 : 12);
    this.vel.lerp(dir, Math.min(1, dt * 1.2));
    this.pos.addScaledVector(this.vel, dt);
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    void dist;
    // contact damage
    const d = this.pos.distanceTo(p.pos);
    if (d < 5 && this.attackCooldown <= 0.5 && p.mode === 'survival') { p.hurt(this.info.damage, this, p.pos.clone().sub(this.pos).normalize()); p.vel.y += 10; this.attackCooldown = 2; }
    // crystals heal
    let crystal = null;
    for (const e of this.game.entities) if (e instanceof EndCrystal && !e.remove && e.pos.distanceTo(this.pos) < 32) { crystal = e; break; }
    if (crystal && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * 2);
    this.crystalBeam = crystal;
    // destroy blocks it flies through (except end stone/obsidian/bedrock)
    if (Math.random() < 0.3) {
      const x = Math.floor(this.pos.x), y = Math.floor(this.pos.y), z = Math.floor(this.pos.z);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
        const id = this.world.getBlock(x + dx, y + dy, z + dz);
        if (id && id !== B.end_stone && id !== B.obsidian && id !== B.bedrock && id !== B.end_portal && BLOCKS[id].hardness >= 0) this.world.setBlock(x + dx, y + dy, z + dz, 0);
      }
    }
    // wings
    const flap = Math.sin(t * 4) * 0.6;
    if (this.parts.wing0) this.parts.wing0.rotation.z = flap;
    if (this.parts.wing1) this.parts.wing1.rotation.z = -flap;
    for (let i = 0; i < 8; i++) if (this.parts['tail' + i]) this.parts['tail' + i].position.x = Math.sin(t * 2 - i * 0.5) * i * 0.08;
    this.animateCommon();
  }

  animate(dt, speed) {
    this.walkPhase += speed * dt * 3.2;
    const sw = Math.sin(this.walkPhase) * Math.min(1, speed / 2) * 0.9;
    const P = this.parts;
    const base = (pv) => pv.userData.baseRot;
    if (P.leg0) P.leg0.rotation.x = base(P.leg0)[0] + sw;
    if (P.leg1) P.leg1.rotation.x = base(P.leg1)[0] - sw;
    if (P.leg2) P.leg2.rotation.x = base(P.leg2)[0] - sw;
    if (P.leg3) P.leg3.rotation.x = base(P.leg3)[0] + sw;
    const forward = base(P.arm0 ?? P.leg0 ?? { userData: { baseRot: [0, 0, 0] } })[0];
    if (P.arm0 && forward === 0) { P.arm0.rotation.x = -sw * 0.8; P.arm1.rotation.x = sw * 0.8; }
    if (P.arm0 && forward !== 0) { P.arm0.rotation.x = forward + Math.sin(this.age * 2) * 0.05; P.arm1.rotation.x = forward - Math.sin(this.age * 2) * 0.05; }
    if (this.type === 'enderman' && this.angry) { if (P.head) P.head.position.y = 40 / 16; }
    for (let i = 0; i < 8; i++) { const l = P['sleg' + i]; if (l) l.rotation.x = Math.sin(this.walkPhase * 2 + i) * 0.3 * Math.min(1, speed); }
    if (P.wing0 && this.type === 'chicken') { const f = this.onGround ? 0 : Math.sin(this.age * 30) * 0.8; P.wing0.rotation.z = f; P.wing1.rotation.z = -f; }
    if (P.tail && this.type === 'wolf') P.tail.rotation.x = this.tamed ? 1.2 + Math.sin(this.age * 8) * 0.2 : 0.6;
    // head look
    const p = this.game.player;
    if (P.head && this.type !== 'ender_dragon') {
      const to = p.pos.clone().sub(this.pos);
      if (to.length() < 8) {
        let hy = Math.atan2(to.x, to.z) - this.yaw;
        while (hy > Math.PI) hy -= Math.PI * 2; while (hy < -Math.PI) hy += Math.PI * 2;
        hy = Math.max(-1, Math.min(1, hy));
        P.head.rotation.y = hy;
        P.head.rotation.x = -Math.atan2(to.y + 1.2 - this.h, Math.hypot(to.x, to.z)) * 0.5;
      } else { P.head.rotation.y *= 0.9; P.head.rotation.x *= 0.9; }
    }
    if (this.type === 'slime') { const sq = this.onGround ? 1 : 1.2; this.model.scale.set(this.size / 2 / Math.sqrt(sq), this.size / 2 * sq, this.size / 2 / Math.sqrt(sq)); }
    if (this.type === 'creeper') { const s = 1 + Math.min(1, this.fuse / 1.5) * 0.25; this.model.scale.set(s, 1 + (s - 1) * 0.5, s); }
    this.animateCommon();
  }

  animateCommon() {
    let l = this.lightAt();
    let r = l, g = l, b = l;
    if (this.hurtTime > 0) { r = Math.min(1, l + 0.5); g *= 0.4; b *= 0.4; }
    if (this.type === 'creeper' && this.fuse > 0 && Math.floor(this.fuse * 8) % 2) { r = g = b = 1.5; }
    if (this.type === 'blaze' || this.type === 'ghast' && this.attackCooldown > 2.5) { r = g = b = Math.max(l, 0.9); }
    for (const m of this.mats) m.color.setRGB(r, g, b);
    for (const pv of Object.values(this.parts)) {
      const mesh = pv.userData.mesh;
      if (!mesh?.userData.tint) continue;
      const c = new THREE.Color(mesh.userData.tint);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.color.setRGB(c.r * r, c.g * g, c.b * b);
    }
    if (this.customName && !this.nameLabel) this.makeNameLabel();
    this.model.rotation.y = this.yaw;
  }
}

// Experience orb: drifts toward the player and is absorbed on contact.
export class XPOrb extends Entity {
  constructor(game, x, y, z, value) {
    super(game, x, y, z);
    this.value = value;
    this.w = this.h = 0.25;
    this.stepHeight = 0;
    const s = 0.12 + Math.min(0.18, Math.log2(value + 1) * 0.04);
    this.inner = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: 0xb8ff40 }));
    this.mesh.add(this.inner);
    this.vel.set((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3);
  }
  update(dt) {
    super.update(dt);
    const p = this.game.player;
    if (this.age > 300) { this.remove = true; return; }
    const to = p.pos.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(this.pos);
    const d = to.length();
    if (!p.dead && p.mode !== 'spectator' && d < 8 && this.age > 0.4) {
      this.vel.addScaledVector(to.normalize(), dt * 40 * (1 - d / 8) + dt * 6);
      this.vel.multiplyScalar(0.9);
      this.pos.addScaledVector(this.vel, dt);
      if (d < 0.7) {
        this.remove = true;
        let xp = this.value;
        const mend = [p.heldItem(), ...p.armor].filter((s) => s && s.dmg > 0 && s.data?.ench?.mending);
        if (mend.length) { const s = mend[Math.floor(Math.random() * mend.length)]; const fix = Math.min(s.dmg, xp * 2); s.dmg -= fix; xp -= Math.ceil(fix / 2); }
        if (p.mode === 'survival' && xp > 0) p.addXP(xp);
        this.game.sfx('xp');
      }
    } else this.physics(dt, 16, 0.9);
    const k = 0.75 + Math.sin(this.age * 6) * 0.25;
    this.inner.material.color.setRGB(0.6 + 0.4 * k, 1, 0.25 * k);
    this.inner.rotation.y += dt * 3;
    this.inner.position.y = 0.15 + Math.sin(this.age * 4) * 0.05;
  }
}

export class EndCrystal extends Entity {
  constructor(game, x, y, z) {
    super(game, x, y, z);
    this.w = 2; this.h = 2;
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8a0ff, transparent: true, opacity: 0.8 });
    this.inner = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat);
    this.outer = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
    this.mesh.add(this.inner); this.mesh.add(this.outer);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
    base.position.y = -0.8; this.mesh.add(base);
    this.maxHealth = this.health = 1;
  }
  update(dt) {
    super.update(dt);
    this.inner.rotation.set(this.age * 2, this.age * 3, 0);
    this.outer.rotation.set(-this.age, this.age * 1.5, this.age);
    this.inner.position.y = this.outer.position.y = 0.6 + Math.sin(this.age * 2) * 0.25;
  }
  hurt() {
    if (this.remove) return false;
    this.remove = true; this.dead = true;
    this.game.explode(this.pos.x, this.pos.y, this.pos.z, 6, true);
    return true;
  }
}
