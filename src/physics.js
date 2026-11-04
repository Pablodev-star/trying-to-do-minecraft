// AABB vs voxel collision shared by the player and all entities.
import { BLOCKS } from './registry.js';
import { rotateBox } from './world.js';

const EPS = 1e-4;

export function collectBoxes(world, x0, y0, z0, x1, y1, z1) {
  const out = [];
  for (let y = Math.floor(y0) - 1; y <= Math.floor(y1); y++)
    for (let z = Math.floor(z0); z <= Math.floor(z1); z++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
        if (!world.isLoaded(x, z)) { out.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
        const id = world.getBlock(x, y, z);
        if (!id) continue;
        const b = BLOCKS[id];
        if (!b.solid) continue;
        if (b.box) {
          let bx = b.box.map((v) => v / 16);
          if (b.orient) bx = rotateBox(bx, world.getMeta(x, y, z) & 3);
          out.push([x + bx[0], y + bx[1], z + bx[2], x + bx[3], y + bx[4], z + bx[5]]);
        } else out.push([x, y, z, x + 1, y + 1, z + 1]);
      }
  return out;
}

// Moves entity e (pos = feet centre, w = width, h = height) by (dx,dy,dz) with collisions.
export function moveEntity(e, world, dx, dy, dz, stepHeight = 0.6) {
  const hw = e.w / 2;
  const p = e.pos;
  const startGround = e.onGround;
  const boxes = collectBoxes(world, p.x - hw + Math.min(dx, 0) - 1, p.y + Math.min(dy, 0) - 1, p.z - hw + Math.min(dz, 0) - 1,
    p.x + hw + Math.max(dx, 0) + 1, p.y + e.h + Math.max(dy, 0) + 1, p.z + hw + Math.max(dz, 0) + 1);
  const res = sweep(p, hw, e.h, dx, dy, dz, boxes);
  let { x, y, z, hitX, hitY, hitZ } = res;
  // step up
  if ((hitX || hitZ) && (startGround || (hitY && dy < 0)) && stepHeight > 0) {
    const up = sweep(p, hw, e.h, 0, stepHeight, 0, boxes);
    const across = sweep({ x: up.x, y: up.y, z: up.z }, hw, e.h, dx, 0, dz, boxes);
    const down = sweep({ x: across.x, y: across.y, z: across.z }, hw, e.h, 0, -stepHeight + Math.min(dy, 0), 0, boxes);
    const d1 = (x - p.x) ** 2 + (z - p.z) ** 2, d2 = (down.x - p.x) ** 2 + (down.z - p.z) ** 2;
    if (d2 > d1 + 1e-6) { x = down.x; y = down.y; z = down.z; hitX = across.hitX; hitZ = across.hitZ; hitY = down.hitY; }
  }
  e.collidedH = hitX || hitZ;
  e.onGround = hitY && dy < 0;
  if (hitX) e.vel.x = 0;
  if (hitZ) e.vel.z = 0;
  if (hitY) e.vel.y = 0;
  p.x = x; p.y = y; p.z = z;
}

function sweep(p, hw, h, dx, dy, dz, boxes) {
  let x = p.x, y = p.y, z = p.z, hitX = false, hitY = false, hitZ = false;
  // Y
  for (const b of boxes) {
    if (x + hw <= b[0] + EPS || x - hw >= b[3] - EPS || z + hw <= b[2] + EPS || z - hw >= b[5] - EPS) continue;
    if (dy < 0 && y >= b[4] - EPS && y + dy < b[4]) { dy = b[4] - y; hitY = true; }
    else if (dy > 0 && y + h <= b[1] + EPS && y + h + dy > b[1]) { dy = b[1] - (y + h); hitY = true; }
  }
  y += dy;
  // X
  for (const b of boxes) {
    if (y + h <= b[1] + EPS || y >= b[4] - EPS || z + hw <= b[2] + EPS || z - hw >= b[5] - EPS) continue;
    if (dx < 0 && x - hw >= b[3] - EPS && x - hw + dx < b[3]) { dx = b[3] - (x - hw); hitX = true; }
    else if (dx > 0 && x + hw <= b[0] + EPS && x + hw + dx > b[0]) { dx = b[0] - (x + hw); hitX = true; }
  }
  x += dx;
  // Z
  for (const b of boxes) {
    if (y + h <= b[1] + EPS || y >= b[4] - EPS || x + hw <= b[0] + EPS || x - hw >= b[3] - EPS) continue;
    if (dz < 0 && z - hw >= b[5] - EPS && z - hw + dz < b[5]) { dz = b[5] - (z - hw); hitZ = true; }
    else if (dz > 0 && z + hw <= b[2] + EPS && z + hw + dz > b[2]) { dz = b[2] - (z + hw); hitZ = true; }
  }
  z += dz;
  return { x, y, z, hitX, hitY, hitZ };
}

export function aabbIntersectsBlocks(world, x0, y0, z0, x1, y1, z1, pred) {
  for (let y = Math.floor(y0); y <= Math.floor(y1 - EPS); y++)
    for (let z = Math.floor(z0); z <= Math.floor(z1 - EPS); z++)
      for (let x = Math.floor(x0); x <= Math.floor(x1 - EPS); x++) {
        const id = world.getBlock(x, y, z);
        if (pred(id, x, y, z)) return true;
      }
  return false;
}

export function rayAABB(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < min[a] || o[a] > max[a]) return null; continue; }
    let t1 = (min[a] - o[a]) / d[a], t2 = (max[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
