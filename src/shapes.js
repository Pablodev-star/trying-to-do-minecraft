// Multi-box block shapes (slabs, stairs, fences, panes, wall torches, doors, beds).
// Boxes are in block-local units [x0,y0,z0,x1,y1,z1] with 0..1 range (fences collide up to 1.5).
// `get(dx, dy, dz)` returns the block id of a neighbour.
import { BLOCKS } from './registry.js';

export function rotateBox(b, r) {
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let i = 0; i < r; i++) {
    const nx0 = z0, nx1 = z1, nz0 = 1 - x1, nz1 = 1 - x0;
    x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1;
  }
  return [Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1)];
}
const px = (a) => a.map((v) => v / 16);
const DIRS = [[0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 0]]; // meta facing order: S, W, N, E

function connects(id, self) {
  if (!id) return false;
  const b = BLOCKS[id];
  if (b.shape === self.shape && (self.shape !== 'fence' || b.name.includes('nether') === self.name.includes('nether'))) return true;
  if (self.shape === 'fence' && b.name.endsWith('_fence_gate')) return true;
  return b.opaque && b.render === 'cube';
}

// Render/selection boxes
export function shapeBoxes(b, meta, get) {
  switch (b.shape) {
    case 'slab': return [meta & 1 ? px([0, 8, 0, 16, 16, 16]) : px([0, 0, 0, 16, 8, 16])];
    case 'stairs': {
      const up = meta & 4;
      const base = up ? px([0, 8, 0, 16, 16, 16]) : px([0, 0, 0, 16, 8, 16]);
      const step = up ? px([0, 0, 0, 16, 8, 8]) : px([0, 8, 0, 16, 16, 8]);
      return [base, rotateBox(step, meta & 3)];
    }
    case 'fence': {
      const out = [px([6, 0, 6, 10, 16, 10])];
      const arms = [[7, 6, 10, 9, 9, 16], [0, 6, 7, 6, 9, 9], [7, 6, 0, 9, 9, 6], [10, 6, 7, 16, 9, 9]];
      const arms2 = [[7, 12, 10, 9, 15, 16], [0, 12, 7, 6, 15, 9], [7, 12, 0, 9, 15, 6], [10, 12, 7, 16, 15, 9]];
      for (let d = 0; d < 4; d++) {
        const [dx, , dz] = DIRS[d];
        if (connects(get(dx, 0, dz), b)) { out.push(px(arms[d]), px(arms2[d])); }
      }
      return out;
    }
    case 'pane': {
      const out = [px([7, 0, 7, 9, 16, 9])];
      const arms = [[7, 0, 9, 9, 16, 16], [0, 0, 7, 7, 16, 9], [7, 0, 0, 9, 16, 7], [9, 0, 7, 16, 16, 9]];
      for (let d = 0; d < 4; d++) {
        const [dx, , dz] = DIRS[d];
        if (connects(get(dx, 0, dz), b)) out.push(px(arms[d]));
      }
      return out;
    }
    case 'torch': {
      // meta 0: floor; 1..4: on a wall, leaning away from it (attached side = DIRS[meta-1])
      if (!meta) return [px([7, 0, 7, 9, 10, 9])];
      return [rotateBox(px([7, 3, 0, 9, 13, 2]), [2, 1, 0, 3][meta - 1])];
    }
    case 'door': return [rotateBox(px([0, 0, 13, 16, 16, 16]), meta & 3)];
    case 'bed': return [px([0, 0, 0, 16, 9, 16])];
    default: return b.box ? [px(b.box)] : [[0, 0, 0, 1, 1, 1]];
  }
}

// Collision boxes (fences are 1.5 tall, torches/panes thin, etc.)
export function collisionBoxes(b, meta, get) {
  if (b.shape === 'fence') {
    const boxes = shapeBoxes(b, meta, get);
    let x0 = 0.375, z0 = 0.375, x1 = 0.625, z1 = 0.625;
    for (const bx of boxes) { x0 = Math.min(x0, bx[0]); z0 = Math.min(z0, bx[2]); x1 = Math.max(x1, bx[3]); z1 = Math.max(z1, bx[5]); }
    return [[x0, 0, z0, x1, 1.5, z1]];
  }
  if (b.shape === 'torch') return [];
  return shapeBoxes(b, meta, get);
}

export function hasShape(b) { return !!b.shape || !!b.box; }

// Boxes for the block at world position (x,y,z), in world coordinates.
export function blockBoxesAt(world, b, x, y, z, collision = false) {
  const meta = world.getMeta(x, y, z);
  const get = (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz);
  let boxes = collision ? collisionBoxes(b, meta, get) : shapeBoxes(b, meta, get);
  if (b.orient && b.box && !b.shape) boxes = boxes.map((bx) => rotateBox(bx, meta & 3));
  return boxes.map((bx) => [x + bx[0], y + bx[1], z + bx[2], x + bx[3], y + bx[4], z + bx[5]]);
}
