// Volumetric block clouds: a tiling 256x256 cloud map; each filled cell becomes a 12x4x12 box.
// Only the outer faces of a cloud are emitted, shaded per face, and the layer drifts slowly
// west to east. The mesh is rebuilt whenever the camera (or the drift) crosses a cell.
import * as THREE from '../lib/three.module.min.js';
import { Simplex } from './noise.js';

const MAP = 256;            // cloud map size in cells (tiles)
const CELL = 12;            // blocks per cell
const THICK = 4;            // cloud thickness in blocks
const VIEW = 24;            // cells drawn in each direction from the camera
export const CLOUD_Y = 132;

function makeMap(seed) {
  // two octaves of simplex noise, thresholded: big fluffy masses with ragged edges
  const n = new Simplex(seed);
  const m = new Uint8Array(MAP * MAP);
  for (let z = 0; z < MAP; z++) for (let x = 0; x < MAP; x++) {
    const v = n.noise2(x / 9, z / 9) * 0.7 + n.noise2(x / 3.2 + 50, z / 3.2) * 0.3;
    m[x + z * MAP] = v > 0.18 ? 1 : 0;
  }
  return m;
}

export class Clouds {
  constructor(scene, seed = 1) {
    this.map = makeMap(seed);
    this.uniforms = {
      cColor: { value: new THREE.Color(1, 1, 1) },
      cOpacity: { value: 0.8 },
      cCenter: { value: new THREE.Vector2() },
      cRadius: { value: VIEW * CELL },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: true, fog: false,
      vertexShader: /* glsl */`
attribute float shade; varying float vShade; varying vec2 vXZ;
void main(){ vShade = shade; vec4 wp = modelMatrix * vec4(position, 1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
uniform vec3 cColor; uniform float cOpacity; uniform vec2 cCenter; uniform float cRadius;
varying float vShade; varying vec2 vXZ;
void main(){
  float d = length(vXZ - cCenter);
  float fade = 1.0 - smoothstep(cRadius * 0.55, cRadius * 0.95, d);
  if (fade <= 0.0) discard;
  gl_FragColor = vec4(cColor * vShade, cOpacity * fade);
  #include <colorspace_fragment>
}`,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0; // before translucent terrain (renderOrder 1), so water and glass tint the clouds behind them
    scene.add(this.mesh);
    this.key = '';
    this.drift = 0;
  }

  filled(cx, cz) { return this.map[(cx & (MAP - 1)) + (cz & (MAP - 1)) * MAP] === 1; }

  build(ccx, ccz) {
    const pos = [], shade = [], ind = [];
    const quad = (pts, s) => {
      const b = pos.length / 3;
      for (const p of pts) { pos.push(p[0], p[1], p[2]); shade.push(s); }
      ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let dz = -VIEW; dz <= VIEW; dz++) for (let dx = -VIEW; dx <= VIEW; dx++) {
      if (dx * dx + dz * dz > VIEW * VIEW) continue;
      const cx = ccx + dx, cz = ccz + dz;
      if (!this.filled(cx, cz)) continue;
      const x0 = dx * CELL, x1 = x0 + CELL, z0 = dz * CELL, z1 = z0 + CELL, y0 = 0, y1 = THICK;
      quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 1.0);           // top
      quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.68);          // bottom
      if (!this.filled(cx - 1, cz)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.86);
      if (!this.filled(cx + 1, cz)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 0.86);
      if (!this.filled(cx, cz - 1)) quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0.78);
      if (!this.filled(cx, cz + 1)) quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0.78);
    }
    // merge top/bottom of neighbouring cells would save triangles, but the layer is small enough
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
    g.setIndex(ind);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }

  /** cam: camera position; dt in seconds; bright 0..1; rain 0..1 */
  update(cam, dt, bright, rain, visible) {
    this.mesh.visible = visible;
    if (!visible) return;
    this.drift += dt * 0.6; // blocks per second
    const wx = cam.x - this.drift;
    const ccx = Math.floor(wx / CELL), ccz = Math.floor(cam.z / CELL);
    const key = ccx + ',' + ccz;
    if (key !== this.key) { this.key = key; this.build(ccx, ccz); }
    this.mesh.position.set(ccx * CELL + this.drift, CLOUD_Y, ccz * CELL);
    // clouds hidden from below the layer look flat: inside the layer, show both sides
    const inside = cam.y > CLOUD_Y && cam.y < CLOUD_Y + THICK;
    this.material.side = inside ? THREE.DoubleSide : THREE.FrontSide;
    this.uniforms.cCenter.value.set(cam.x, cam.z);
    const l = (0.1 + 0.9 * bright) * (1 - rain * 0.45);
    this.uniforms.cColor.value.setRGB(l, l, l * (1.02 + (1 - bright) * 0.25));
    this.uniforms.cOpacity.value = 0.86 + rain * 0.1;
  }
}
