// The player: movement, survival stats, mining, combat and item use.
import * as THREE from '../lib/three.module.min.js';
import { BLOCKS, B, ITEMS, I, maxStack } from './registry.js';
import { moveEntity, aabbIntersectsBlocks, rayAABB } from './physics.js';
import { Mob, Projectile, PrimedTNT, EndCrystal } from './entities.js';
import { SOLID, rotateBox } from './world.js';

const GRAV = 32;

export function xpForLevel(l) { return l < 16 ? 2 * l + 7 : l < 31 ? 5 * l - 38 : 9 * l - 158; }

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 80, 0);
    this.vel = new THREE.Vector3();
    this.w = 0.6; this.h = 1.8;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.mode = 'survival';
    this.flying = false;
    this.health = 20; this.maxHealth = 20;
    this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 15;
    this.xp = 0; this.level = 0; this.xpTotal = 0;
    this.inventory = new Array(36).fill(null);
    this.armor = [null, null, null, null];
    this.selected = 0;
    this.dead = false;
    this.hurtTime = 0;
    this.fallStart = null;
    this.regenTimer = 0; this.starveTimer = 0; this.drownTimer = 0;
    this.fire = 0;
    this.mining = null; // {x,y,z,progress}
    this.useTimer = 0; this.using = null;
    this.attackCooldown = 0;
    this.swing = 0;
    this.sprinting = false; this.sneaking = false;
    this.portalTime = 0; this.portalCooldown = 0;
    this.spawnPoint = null;
    this.lastHurtMob = null;
    this.bob = 0;
    this.placeCooldown = 0;
  }
  get world() { return this.game.world; }

  // ---------------------------------------------------------------- inventory helpers
  heldItem() { return this.inventory[this.selected]; }
  give(id, count = 1, dmg = 0) {
    const max = maxStack(id);
    // merge into existing stacks, hotbar first
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id && !s.dmg && !dmg && s.count < max) { const n = Math.min(count, max - s.count); s.count += n; count -= n; }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.inventory[i]) { const n = Math.min(count, max); this.inventory[i] = { id, count: n, dmg }; count -= n; }
    }
    this.game.ui?.inventoryChanged();
    return count; // leftover
  }
  countItem(id) { let n = 0; for (const s of this.inventory) if (s && s.id === id) n += s.count; return n; }
  takeItem(id, n = 1) {
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.inventory[i];
      if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (s.count <= 0) this.inventory[i] = null; }
    }
    this.game.ui?.refresh();
  }
  consumeHeld(n = 1) {
    if (this.mode === 'creative') return;
    const s = this.heldItem();
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.inventory[this.selected] = null;
    this.game.ui?.refresh();
  }
  replaceHeld(id) {
    if (this.mode === 'creative') { if (!this.countItem(id)) this.give(id, 1); return; }
    const s = this.heldItem();
    if (s && s.count > 1) { s.count--; if (this.give(id, 1) > 0) this.game.spawnItem(this.pos.x, this.pos.y + 1, this.pos.z, { id, count: 1 }); }
    else this.inventory[this.selected] = { id, count: 1, dmg: 0 };
    this.game.ui?.refresh();
  }
  damageHeld(n = 1) {
    if (this.mode === 'creative') return;
    const s = this.heldItem();
    if (!s) return;
    const it = ITEMS[s.id];
    if (!it.durability) return;
    s.dmg = (s.dmg ?? 0) + n;
    if (s.dmg >= it.durability) { this.inventory[this.selected] = null; this.game.sfx('break_tool'); }
    this.game.ui?.refresh();
  }
  armorPoints() { let a = 0; for (const s of this.armor) if (s) a += ITEMS[s.id].armor ?? 0; return a; }

  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + (this.sneaking ? 1.27 : 1.62), this.pos.z); }
  lookDir() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  // ---------------------------------------------------------------- damage
  hurt(amount, source, dir) {
    if (this.mode !== 'survival' || this.dead) return false;
    if (this.hurtTime > 0.35) return false;
    if (amount <= 0) { if (dir) { this.vel.x += dir.x * 4; this.vel.z += dir.z * 4; } return false; }
    const isArmorable = source !== 'fall' && source !== 'drown' && source !== 'starve' && source !== 'void';
    let dmg = amount;
    if (isArmorable) {
      dmg *= 1 - Math.min(20, this.armorPoints()) / 25;
      for (let i = 0; i < 4; i++) { const a = this.armor[i]; if (a) { a.dmg = (a.dmg ?? 0) + 1; if (a.dmg >= ITEMS[a.id].durability) this.armor[i] = null; } }
    }
    this.health -= dmg;
    this.hurtTime = 0.5;
    this.exhaustion += 0.1;
    this.game.sfx('hurt');
    if (dir) { this.vel.x += dir.x * 8; this.vel.z += dir.z * 8; this.vel.y = Math.max(this.vel.y, 5); }
    else if (source && source.pos) { const d = this.pos.clone().sub(source.pos).setY(0).normalize(); this.vel.x += d.x * 8; this.vel.z += d.z * 8; this.vel.y = Math.max(this.vel.y, 5); }
    if (this.health <= 0) {
      // totem
      const idx = this.inventory.findIndex((s) => s && s.id === I.totem);
      if (idx >= 0) { this.inventory[idx] = null; this.health = 1; this.game.chat('¡El tótem de la inmortalidad te ha salvado!'); return true; }
      this.die(source);
    }
    this.game.ui?.refresh();
    return true;
  }
  die(source) {
    this.dead = true; this.health = 0;
    const msg = typeof source === 'string' ? { fall: 'cayó desde muy alto', drown: 'se ahogó', lava: 'intentó nadar en lava', fire: 'ardió hasta morir', starve: 'murió de hambre', void: 'cayó al vacío', cactus: 'murió pinchado', explosion: 'explotó' }[source] ?? 'murió'
      : source instanceof Mob ? `fue asesinado por ${source.type}` : 'murió';
    this.deathMessage = `Jugador ${msg}`;
    if (!this.game.keepInventory) {
      for (let i = 0; i < 36; i++) if (this.inventory[i]) { this.game.spawnItem(this.pos.x, this.pos.y + 1, this.pos.z, this.inventory[i], true); this.inventory[i] = null; }
      for (let i = 0; i < 4; i++) if (this.armor[i]) { this.game.spawnItem(this.pos.x, this.pos.y + 1, this.pos.z, this.armor[i], true); this.armor[i] = null; }
      this.xp = 0; this.level = 0;
    }
    this.game.onPlayerDeath();
  }
  respawn() {
    this.dead = false; this.health = 20; this.food = 20; this.saturation = 5; this.air = 15; this.fire = 0;
    this.vel.set(0, 0, 0); this.fallStart = null;
  }
  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
  addXP(n) {
    this.xpTotal += n;
    this.xp += n;
    while (this.xp >= xpForLevel(this.level)) { this.xp -= xpForLevel(this.level); this.level++; if (this.level % 5 === 0) this.game.sfx('levelup'); }
    this.game.ui?.refresh();
  }
  eat(food, sat) {
    this.food = Math.min(20, this.food + food);
    this.saturation = Math.min(this.food, this.saturation + sat);
  }

  // ---------------------------------------------------------------- update
  update(dt, input) {
    if (this.dead) return;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.placeCooldown > 0) this.placeCooldown -= dt;
    if (this.portalCooldown > 0) this.portalCooldown -= dt;
    this.swing = Math.max(0, this.swing - dt * 4);
    const w = this.world;
    const creative = this.mode === 'creative', spectator = this.mode === 'spectator';
    if (!creative && !spectator) this.flying = false;
    if (spectator) this.flying = true;

    // look
    // movement input
    let fx = 0, fz = 0;
    if (input.forward) fz -= 1;
    if (input.back) fz += 1;
    if (input.left) fx -= 1;
    if (input.right) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const mx = fx * cos + fz * sin, mz = -fx * sin + fz * cos;
    this.sneaking = input.sneak && !this.flying;
    if (input.sprint && input.forward && this.food > 6 && !this.sneaking) this.sprinting = true;
    if (!input.forward || this.sneaking || (this.collidedH && !this.flying) || (this.food <= 6 && !creative)) this.sprinting = false;

    const feetBlock = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
    const inLadder = BLOCKS[feetBlock].climbable;
    const hw = this.w / 2;
    const touching = (pred) => aabbIntersectsBlocks(w, this.pos.x - hw, this.pos.y, this.pos.z - hw, this.pos.x + hw, this.pos.y + this.h, this.pos.z + hw, pred);
    this.inWater = touching((id) => id === B.water);
    this.inLava = touching((id) => id === B.lava);
    const inWeb = touching((id) => id === B.cobweb);
    const headId = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.62), Math.floor(this.pos.z));
    this.headInWater = headId === B.water;
    this.headInLava = headId === B.lava;
    const below = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.05), Math.floor(this.pos.z));

    let speed = this.flying ? (this.sprinting ? 21.6 : 10.9) : this.sneaking ? 1.31 : this.sprinting ? 5.61 : 4.32;
    if (this.using) speed *= 0.35;
    if (!this.flying && below === B.soul_sand) speed *= 0.5;
    if (this.inWater && !this.flying) speed *= 0.5;
    if (this.inLava && !this.flying) speed *= 0.3;
    if (inWeb) speed *= 0.25;

    if (this.flying) {
      const tx = mx * speed, tz = mz * speed;
      this.vel.x += (tx - this.vel.x) * Math.min(1, dt * 8);
      this.vel.z += (tz - this.vel.z) * Math.min(1, dt * 8);
      let ty = 0;
      if (input.jump) ty += 8; if (input.sneak) ty -= 8;
      this.vel.y += (ty - this.vel.y) * Math.min(1, dt * 10);
      if (spectator) { this.pos.addScaledVector(this.vel, dt); }
      else moveEntity(this, w, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, 0);
      if (this.onGround && !spectator) this.flying = false;
    } else {
      const ground = this.onGround;
      const accel = ground ? 14 : this.inWater ? 6 : 2.5;
      const tx = mx * speed, tz = mz * speed;
      this.vel.x += (tx - this.vel.x) * Math.min(1, dt * accel);
      this.vel.z += (tz - this.vel.z) * Math.min(1, dt * accel);
      if (this.inWater || this.inLava) {
        this.vel.y -= GRAV * 0.2 * dt;
        this.vel.y *= 0.85 ** (dt * 20);
        if (input.jump) this.vel.y = Math.min(this.vel.y + 30 * dt, 3.2);
        if (this.collidedH && input.jump) this.vel.y = 4;
      } else if (inLadder) {
        this.vel.y = input.sneak ? 0 : (this.collidedH || input.jump || input.forward) ? 2.35 : Math.max(this.vel.y - GRAV * dt, -2.4);
        this.fallStart = null;
      } else {
        this.vel.y -= GRAV * dt;
        this.vel.y *= 0.98 ** (dt * 20);
        if (input.jump && ground && this.jumpCooldown <= 0) {
          this.vel.y = 9.0;
          this.jumpCooldown = 0.25;
          if (this.sprinting) { this.vel.x += -sin * 2; this.vel.z += -cos * 2; this.exhaustion += 0.2; } else this.exhaustion += 0.05;
        }
      }
      if (inWeb) { this.vel.y *= 0.1; this.fallStart = null; }
      this.jumpCooldown = (this.jumpCooldown ?? 0) - dt;
      // sneak edge protection
      let dx = this.vel.x * dt, dz = this.vel.z * dt;
      if (this.sneaking && ground) {
        const supported = (x, z) => aabbIntersectsBlocks(w, x - hw, this.pos.y - 0.6, z - hw, x + hw, this.pos.y - 0.01, z + hw, (id) => SOLID[id]);
        if (!supported(this.pos.x + dx, this.pos.z)) { dx = 0; this.vel.x = 0; }
        if (!supported(this.pos.x, this.pos.z + dz)) { dz = 0; this.vel.z = 0; }
        if (!supported(this.pos.x + dx, this.pos.z + dz)) { dx = 0; dz = 0; }
      }
      const prevY = this.pos.y;
      moveEntity(this, w, dx, this.vel.y * dt, dz, 0.6);
      const moved = Math.hypot(this.pos.x - (this.pos.x - dx), dz);
      if (this.onGround) this.exhaustion += (this.sprinting ? 0.1 : 0) * moved;
      // fall tracking
      if (!this.onGround && this.vel.y < 0 && this.fallStart == null) this.fallStart = prevY;
      if (this.vel.y > 0 || this.inWater || this.inLava) this.fallStart = null;
      if (this.onGround && this.fallStart != null) {
        const d = this.fallStart - this.pos.y - 3;
        const landed = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
        if (d > 0 && this.mode === 'survival' && landed !== B.hay_block && landed !== B.water) this.hurt(Math.ceil(d), 'fall');
        if (d > 0) this.game.sfx('land');
        this.fallStart = null;
      }
      this.bob += Math.hypot(this.vel.x, this.vel.z) * dt * (ground ? 1 : 0);
      if (ground && Math.hypot(this.vel.x, this.vel.z) > 1) {
        this.stepAcc = (this.stepAcc ?? 0) + Math.hypot(this.vel.x, this.vel.z) * dt;
        if (this.stepAcc > (this.sprinting ? 2 : 1.7)) { this.stepAcc = 0; this.game.sfx('step:' + (BLOCKS[below]?.sound ?? 'stone')); }
      }
    }

    // ---- survival mechanics
    if (this.mode === 'survival') this.survivalTick(dt, touching);

    // portals
    const inPortal = touching((id) => id === B.nether_portal);
    const inEndPortal = touching((id) => id === B.end_portal);
    if (!inPortal && !inEndPortal) this.portalLock = false;
    if (this.portalLock) { this.portalTime = 0; }
    else if (inEndPortal && this.portalCooldown <= 0) { this.portalCooldown = 5; this.game.travel(this.game.dim === 'end' ? 'overworld' : 'end'); return; }
    else if (inPortal && this.portalCooldown <= 0) {
      this.portalTime += dt;
      if (this.portalTime > (creative ? 0.5 : 4)) { this.portalTime = 0; this.portalCooldown = 6; this.game.travel(this.game.dim === 'nether' ? 'overworld' : 'nether'); return; }
    } else if (!this.portalLock) this.portalTime = Math.max(0, this.portalTime - dt * 2);
    if (this.pos.y < -64) { if (this.mode === 'survival') this.hurt(4, 'void'); else if (this.pos.y < -100) this.pos.y = 140; }
  }

  survivalTick(dt, touching) {
    // air
    if (this.headInWater) {
      this.air -= dt;
      if (this.air <= 0) { this.air = 0; this.drownTimer += dt; if (this.drownTimer >= 1) { this.drownTimer = 0; this.hurt(2, 'drown'); } }
    } else this.air = Math.min(15, this.air + dt * 5);
    // lava / fire
    if (this.inLava) { this.fire = 8; this.lavaTimer = (this.lavaTimer ?? 0) + dt; if (this.lavaTimer > 0.5) { this.lavaTimer = 0; this.hurtTime = 0; this.hurt(4, 'lava'); } }
    if (touching((id) => id === B.fire)) this.fire = Math.max(this.fire, 4);
    if (this.inWater) this.fire = 0;
    if (this.fire > 0) { this.fire -= dt; this.fireTimer = (this.fireTimer ?? 0) + dt; if (this.fireTimer > 1) { this.fireTimer = 0; this.hurt(1, 'fire'); } }
    const hw = this.w / 2 + 0.05;
    if (aabbIntersectsBlocks(this.world, this.pos.x - hw, this.pos.y - 0.05, this.pos.z - hw, this.pos.x + hw, this.pos.y + this.h, this.pos.z + hw, (id) => id === B.cactus)) this.hurt(1, 'cactus');
    if (this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z)) === B.magma_block && !this.sneaking) this.hurt(1, 'fire');
    // hunger
    while (this.exhaustion >= 4) { this.exhaustion -= 4; if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1); else this.food = Math.max(0, this.food - 1); }
    if (this.food >= 20 && this.saturation > 0 && this.health < 20) {
      this.regenTimer += dt;
      if (this.regenTimer >= 0.5) { this.regenTimer = 0; this.heal(1); this.exhaustion += 6; }
    } else if (this.food >= 18 && this.health < 20) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4) { this.regenTimer = 0; this.heal(1); this.exhaustion += 6; }
    } else if (this.food <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) { this.starveTimer = 0; if (this.health > (this.game.difficulty === 'hard' ? 0 : 1)) this.hurt(1, 'starve'); }
    }
  }

  // ---------------------------------------------------------------- targeting
  pick() {
    const eye = this.eyePos(), dir = this.lookDir();
    const reach = this.mode === 'creative' ? 5 : 4.5;
    const hit = this.world.raycast(eye, dir, reach);
    let ent = null, entDist = Infinity;
    for (const e of this.game.entities) {
      if (!(e instanceof Mob || e instanceof EndCrystal) || e.dead) continue;
      const hw = e.w / 2;
      const t = rayAABB(eye, dir, { x: e.pos.x - hw, y: e.pos.y, z: e.pos.z - hw }, { x: e.pos.x + hw, y: e.pos.y + e.h, z: e.pos.z + hw });
      if (t != null && t < Math.min(3.5, entDist)) { ent = e; entDist = t; }
    }
    if (ent && (!hit || entDist < hit.dist)) return { entity: ent, dist: entDist };
    return hit ? { block: hit } : null;
  }

  // ---------------------------------------------------------------- mining
  miningSpeed(id) {
    const b = BLOCKS[id];
    const held = this.heldItem();
    const it = held ? ITEMS[held.id] : null;
    let speed = 1;
    const correctTool = it && it.toolType && (it.toolType === b.tool || (it.toolType === 'sword' && b.name === 'cobweb') || (it.toolType === 'shears' && (b.name.endsWith('_leaves') || b.name.endsWith('_wool') || b.name === 'cobweb')));
    if (correctTool) speed = it.toolType === 'sword' ? 15 : it.speed ?? 1;
    else if (it?.toolType === 'sword') speed = 1.5;
    const canHarvest = !b.needsTool || (correctTool && (it.level ?? 0) >= b.level);
    if (this.headInWater) speed /= 5;
    if (!this.onGround && !this.flying) speed /= 5;
    return { perSec: speed / b.hardness / (canHarvest ? 30 : 100) * 20, canHarvest, correctTool };
  }

  updateMining(dt, holding) {
    if (!holding || this.dead) { this.mining = null; return; }
    const p = this.pick();
    if (!p) { this.mining = null; return; }
    if (p.entity) return;
    const h = p.block;
    const b = BLOCKS[h.id];
    if (this.mode === 'creative') {
      if (this.placeCooldown > 0) return;
      const held = this.heldItem();
      if (held && ITEMS[held.id].toolType === 'sword') return;
      if (b.hardness >= 0 || this.game.cheats) { this.game.breakBlock(h.x, h.y, h.z, false); this.placeCooldown = 0.25; }
      return;
    }
    if (this.mode !== 'survival') return;
    if (b.hardness < 0) return;
    if (!this.mining || this.mining.x !== h.x || this.mining.y !== h.y || this.mining.z !== h.z) this.mining = { x: h.x, y: h.y, z: h.z, progress: 0, sound: 0 };
    const { perSec, canHarvest } = this.miningSpeed(h.id);
    this.mining.progress += b.hardness === 0 ? 1 : perSec * dt;
    this.mining.sound += dt;
    this.swing = 1;
    if (this.mining.sound > 0.25) { this.mining.sound = 0; this.game.sfx('dig:' + b.sound); }
    this.exhaustion += 0.005 * dt;
    if (this.mining.progress >= 1) {
      this.game.breakBlock(h.x, h.y, h.z, canHarvest);
      const held = this.heldItem();
      if (held && ITEMS[held.id].durability && b.hardness > 0) this.damageHeld(ITEMS[held.id].toolType === 'sword' ? 2 : 1);
      this.mining = null;
      this.mineDelay = 0.3;
    }
  }

  attack() {
    this.swing = 1;
    const p = this.pick();
    if (!p || !p.entity) return false;
    const e = p.entity;
    const held = this.heldItem();
    const it = held ? ITEMS[held.id] : null;
    let dmg = it?.damage ?? 1;
    const crit = !this.onGround && this.vel.y < 0 && !this.inWater;
    if (crit) dmg *= 1.5;
    if (this.mode === 'creative' && e instanceof Mob && e.type !== 'ender_dragon') dmg = Math.max(dmg, 1000);
    const dir = this.lookDir().setY(0).normalize();
    if (this.sprinting) dir.multiplyScalar(1.6);
    if (e.hurt(dmg, this, dir)) {
      if (crit) this.game.sfx('crit');
      this.exhaustion += 0.1;
      if (it?.durability) this.damageHeld(it.toolType === 'sword' ? 1 : 2);
    }
    this.sprinting = false;
    return true;
  }

  // ---------------------------------------------------------------- right click
  use() {
    if (this.dead || this.placeCooldown > 0) return;
    const held = this.heldItem();
    const it = held ? ITEMS[held.id] : null;
    const p = this.pick();
    const g = this.game, w = this.world;
    this.placeCooldown = 0.2;

    // entity interaction
    if (p && p.entity && p.entity instanceof Mob) {
      const e = p.entity;
      const name = it?.name;
      if (e.type === 'villager') { g.ui.openTrade(e); return; }
      if (e.type === 'sheep' && name === 'shears') { if (e.shear()) { this.damageHeld(); g.sfx('shear'); } return; }
      if (e.type === 'cow' && name === 'bucket') { this.replaceHeld(I.milk_bucket); return; }
      if (e.type === 'wolf' && name === 'bone' && !e.tamed) {
        this.consumeHeld();
        if (Math.random() < 0.33) { e.tamed = true; e.owner = this; e.angry = false; e.target = null; g.chat('¡Has domesticado un lobo!'); } return;
      }
      if (e.type === 'wolf' && e.tamed && !it) { e.sitting = !e.sitting; return; }
      if (e.info.food && name && e.info.food.includes(name)) {
        if (e.baby) { e.growTimer -= 30; this.consumeHeld(); return; }
        if (e.breedCooldown <= 0 && e.love <= 0) { e.love = 30; this.consumeHeld(); g.sfx('eat'); return; }
      }
      if (it?.spawnEgg) { g.spawnMob(it.spawnEgg, e.pos.x, e.pos.y, e.pos.z, { baby: true }); this.consumeHeld(); return; }
    }

    const hit = p?.block;
    // interactive blocks
    if (hit && !this.sneaking) {
      const id = hit.id;
      const k = `${hit.x},${hit.y},${hit.z}`;
      if (id === B.crafting_table) { g.ui.open('crafting'); return; }
      if (id === B.furnace || id === B.lit_furnace) { g.ui.open('furnace', g.getTile(hit.x, hit.y, hit.z, 'furnace'), k); return; }
      if (id === B.chest) { g.ui.open('chest', g.getTile(hit.x, hit.y, hit.z, 'chest'), k); return; }
      if (id === B.bed) { g.sleep(hit); return; }
      if (id === B.oak_door) { w.setBlock(hit.x, hit.y, hit.z, B.oak_door, (w.getMeta(hit.x, hit.y, hit.z) + 1) & 3); g.sfx('door'); return; }
      if (id === B.tnt && (it?.name === 'flint_and_steel')) { w.setBlock(hit.x, hit.y, hit.z, 0); g.addEntity(new PrimedTNT(g, hit.x, hit.y, hit.z)); this.damageHeld(); return; }
      if (id === B.end_portal_frame && it?.name === 'ender_eye') {
        w.setBlock(hit.x, hit.y, hit.z, B.end_portal_frame_eye, w.getMeta(hit.x, hit.y, hit.z));
        this.consumeHeld(); g.sfx('portal');
        g.checkEndPortal(hit.x, hit.y, hit.z);
        return;
      }
    }
    if (!it) return;

    // food
    if (it.food) {
      if (this.food < 20 || this.mode === 'creative' || it.name === 'golden_apple' || it.milk) { this.using = { kind: 'eat', time: 0, dur: it.name === 'dried_kelp' ? 0.8 : 1.6 }; }
      return;
    }
    if (it.toolType === 'bow') {
      if (this.mode === 'creative' || this.countItem(I.arrow) > 0) this.using = { kind: 'bow', time: 0 };
      return;
    }
    if (it.armor != null) {
      const slot = it.slot;
      const prev = this.armor[slot];
      this.armor[slot] = held;
      this.inventory[this.selected] = prev;
      g.sfx('equip'); g.ui.refresh();
      return;
    }
    const throwable = { snowball: 'snowball', egg: 'egg', ender_pearl: 'ender_pearl' }[it.name];
    if (throwable) {
      const dir = this.lookDir();
      const pr = new Projectile(g, throwable, this.eyePos().addScaledVector(dir, 0.4), dir.multiplyScalar(30), this);
      g.addEntity(pr); this.consumeHeld(); this.swing = 1; g.sfx('throw');
      return;
    }
    if (it.name === 'ender_eye' && !hit) {
      if (g.dim !== 'overworld') return;
      const s = w.gen.stronghold;
      const pr = new Projectile(g, 'eye', this.eyePos(), new THREE.Vector3(), this);
      pr.target = s; g.addEntity(pr); this.consumeHeld(); g.sfx('throw');
      return;
    }
    if (it.spawnEgg && hit) {
      const [fx, fy, fz] = hit.face;
      g.spawnMob(it.spawnEgg, hit.x + fx + 0.5, hit.y + fy, hit.z + fz + 0.5);
      this.consumeHeld();
      return;
    }
    // buckets
    if (it.name === 'bucket') {
      const fh = w.raycast(this.eyePos(), this.lookDir(), 5, true);
      if (fh && (fh.id === B.water || fh.id === B.lava) && w.getMeta(fh.x, fh.y, fh.z) === 0) {
        w.setBlock(fh.x, fh.y, fh.z, 0);
        this.replaceHeld(fh.id === B.water ? I.water_bucket : I.lava_bucket);
        g.sfx('bucket');
      }
      return;
    }
    if ((it.name === 'water_bucket' || it.name === 'lava_bucket') && hit) {
      const tgt = this.placeTarget(hit);
      if (!tgt) return;
      if (it.name === 'water_bucket' && g.dim === 'nether') { g.sfx('fizz'); this.replaceHeld(I.bucket); return; }
      w.setBlock(tgt.x, tgt.y, tgt.z, it.name === 'water_bucket' ? B.water : B.lava, 0);
      if (this.mode !== 'creative') this.inventory[this.selected] = { id: I.bucket, count: 1, dmg: 0 };
      g.sfx('bucket'); g.ui.refresh();
      return;
    }
    if (!hit) return;
    const id = hit.id;
    // tools on blocks
    if (it.toolType === 'hoe' && (id === B.grass_block || id === B.dirt) && !w.getBlock(hit.x, hit.y + 1, hit.z)) {
      w.setBlock(hit.x, hit.y, hit.z, B.farmland); this.damageHeld(); g.sfx('dig:grass'); this.swing = 1; return;
    }
    if (it.toolType === 'shovel' && id === B.grass_block && !w.getBlock(hit.x, hit.y + 1, hit.z)) { w.setBlock(hit.x, hit.y, hit.z, B.podzol); this.damageHeld(); return; }
    if (it.toolType === 'fns') {
      if (id === B.obsidian && g.tryLightPortal(hit)) { this.damageHeld(); g.sfx('ignite'); return; }
      const t = this.placeTarget(hit);
      if (t) { w.setBlock(t.x, t.y, t.z, B.fire); this.damageHeld(); g.sfx('ignite'); if (w.getBlock(t.x, t.y - 1, t.z) === B.obsidian) g.tryLightPortal({ x: t.x, y: t.y - 1, z: t.z, face: [0, 1, 0] }); }
      return;
    }
    if (it.name === 'bone_meal') {
      if (id >= B.wheat_0 && id <= B.potatoes_7) {
        const stage = (id - B.wheat_0) % 8;
        w.setBlock(hit.x, hit.y, hit.z, id - stage + Math.min(7, stage + 2 + ((Math.random() * 3) | 0)));
        this.consumeHeld(); g.particles?.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 0x60ff60); return;
      }
      if (id === B.oak_sapling || id === B.spruce_sapling || id === B.birch_sapling) { if (Math.random() < 0.45) w.growTree(hit.x, hit.y, hit.z, id); this.consumeHeld(); return; }
      if (id === B.grass_block) {
        for (let i = 0; i < 24; i++) {
          const x = hit.x + ((Math.random() * 7) | 0) - 3, z = hit.z + ((Math.random() * 7) | 0) - 3;
          if (w.getBlock(x, hit.y, z) === B.grass_block && !w.getBlock(x, hit.y + 1, z)) w.setBlock(x, hit.y + 1, z, Math.random() < 0.85 ? B.short_grass : [B.dandelion, B.poppy][(Math.random() * 2) | 0]);
        }
        this.consumeHeld(); return;
      }
    }
    // seeds / crops
    const crop = { wheat_seeds: B.wheat_0, carrot: B.carrots_0, potato: B.potatoes_0 }[it.name];
    if (crop != null) {
      if ((id === B.farmland || id === B.farmland_wet) && hit.face[1] === 1 && !w.getBlock(hit.x, hit.y + 1, hit.z)) { w.setBlock(hit.x, hit.y + 1, hit.z, crop); this.consumeHeld(); g.sfx('dig:grass'); }
      return;
    }
    // place block
    if (it.block != null) this.placeBlock(hit, it.block);
  }

  placeTarget(hit) {
    const w = this.world;
    const cur = BLOCKS[hit.id];
    if (cur.replaceable && hit.id !== B.water && hit.id !== B.lava) return { x: hit.x, y: hit.y, z: hit.z };
    const [fx, fy, fz] = hit.face;
    const x = hit.x + fx, y = hit.y + fy, z = hit.z + fz;
    const t = w.getBlock(x, y, z);
    if (t && !BLOCKS[t].replaceable) return null;
    return { x, y, z };
  }

  placeBlock(hit, id) {
    const w = this.world, g = this.game;
    const tgt = this.placeTarget(hit);
    if (!tgt) return;
    const { x, y, z } = tgt;
    if (y < 0 || y >= 128) return;
    const b = BLOCKS[id];
    // support rules
    const below = w.getBlock(x, y - 1, z);
    if (b.render === 'cross' && id !== B.cobweb) {
      const ok = id === B.sugar_cane ? (below === B.sugar_cane || below === B.grass_block || below === B.dirt || below === B.sand)
        : (below === B.grass_block || below === B.dirt || below === B.podzol || below === B.farmland || below === B.farmland_wet || ((id === B.brown_mushroom || id === B.red_mushroom) && SOLID[below]) || (id === B.dead_bush && (below === B.sand || below === B.red_sand)));
      if (!ok) return;
    }
    if ((id === B.torch || id === B.soul_torch) && !SOLID[below]) return;
    if (id === B.cactus && below !== B.sand && below !== B.cactus && below !== B.red_sand) return;
    // collision with entities
    if (b.solid) {
      let box = b.box ? b.box.map((v) => v / 16) : [0, 0, 0, 1, 1, 1];
      const meta0 = this.facingMeta();
      if (b.orient && b.box) box = rotateBox(box, meta0);
      const bx = [x + box[0], y + box[1], z + box[2], x + box[3], y + box[4], z + box[5]];
      const overlaps = (e) => {
        const hw = e.w / 2;
        return e.pos.x + hw > bx[0] && e.pos.x - hw < bx[3] && e.pos.y + e.h > bx[1] && e.pos.y < bx[4] && e.pos.z + hw > bx[2] && e.pos.z - hw < bx[5];
      };
      if (this.mode !== 'spectator' && overlaps(this)) return;
      for (const e of g.entities) if (e instanceof Mob && !e.dead && overlaps(e)) return;
    }
    let meta = 0;
    if (b.orient) meta = this.facingMeta();
    if (id === B.ladder) { const [fx, , fz] = hit.face; if (fx || fz) meta = fz === 1 ? 2 : fz === -1 ? 0 : fx === 1 ? 3 : 1; }
    w.setBlock(x, y, z, id, meta);
    if (id === B.bed) { /* single-block bed */ }
    this.consumeHeld();
    this.swing = 1;
    g.sfx('place:' + b.sound);
    // checks: carved pumpkin golem? (iron golem: 4 iron blocks T + pumpkin)
    if (id === B.pumpkin || id === B.jack_o_lantern) g.checkGolem(x, y, z);
  }

  facingMeta() {
    // block front faces the player: player looks along -z when yaw=0 => block front faces +z (south) => meta 0
    let a = this.yaw % (Math.PI * 2); if (a < 0) a += Math.PI * 2;
    const q = Math.round(a / (Math.PI / 2)) & 3;
    return [0, 3, 2, 1][q];
  }

  // continuous use (eating / bow)
  updateUse(dt, holding) {
    if (!this.using) return;
    const held = this.heldItem();
    const it = held ? ITEMS[held.id] : null;
    if (!it) { this.using = null; return; }
    this.using.time += dt;
    if (this.using.kind === 'eat') {
      if (!holding) { this.using = null; return; }
      if (Math.floor(this.using.time * 5) !== Math.floor((this.using.time - dt) * 5)) this.game.sfx('eat');
      if (this.using.time >= this.using.dur) {
        if (it.milk) { this.replaceHeld(I.bucket); this.using = null; return; }
        this.eat(it.food[0], it.food[1]);
        if (it.name === 'golden_apple') { this.heal(4); this.absorb = 4; }
        if (it.name === 'rotten_flesh' && Math.random() < 0.8) this.saturation = 0;
        if (it.name === 'mushroom_stew') this.replaceHeld(I.bowl); else this.consumeHeld();
        this.game.sfx('burp');
        this.using = null;
        this.game.ui.refresh();
      }
    } else if (this.using.kind === 'bow') {
      if (!holding) {
        const charge = Math.min(1, this.using.time / 1);
        this.using = null;
        if (charge < 0.1) return;
        if (this.mode !== 'creative') this.takeItem(I.arrow, 1);
        const dir = this.lookDir();
        const pr = new Projectile(this.game, 'arrow', this.eyePos().addScaledVector(dir, 0.3), dir.multiplyScalar(60 * charge), this);
        pr.power = charge >= 1 ? 1.5 : 1;
        this.game.addEntity(pr);
        this.damageHeld();
        this.game.sfx('bow');
      }
    }
  }
}
