// World shaders (classic + "shaders" mode) and the optional post-processing pipeline:
// sun/moon shadow mapping, waving foliage, animated water with reflections and specular,
// warm block light, bloom, god rays, tone mapping and vignette. All written for this game.
import * as THREE from '../lib/three.module.min.js';

export const SHADOW_SIZE = 2048;
export const SHADOW_RANGE = 72;

// ---------------------------------------------------------------- chunk material
export function chunkShaders(alphaTest, translucent) {
  const vert = /* glsl */`
attribute vec2 light;
attribute vec3 color;
attribute float mat;
uniform float time; uniform float shaderOn; uniform mat4 shadowMatrix; uniform float rain;
varying vec2 vUv; varying vec2 vLight; varying vec3 vColor; varying float vDist;
varying vec3 vWorldPos; varying vec3 vNormal; varying vec4 vShadow; varying float vMat;
void main(){
  vUv = uv; vLight = light; vColor = color; vMat = mat; vNormal = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  if (shaderOn > 0.5) {
    float wind = 1.0 + rain * 1.5;
    if (mat > 0.5 && mat < 1.5) {            // leaves
      wp.x += sin(time * 1.7 + wp.x * 0.6 + wp.y * 0.4) * 0.035 * wind;
      wp.z += cos(time * 1.3 + wp.z * 0.6 + wp.y * 0.3) * 0.035 * wind;
    } else if (mat > 1.5 && mat < 2.5) {     // plant tops
      wp.x += sin(time * 2.1 + wp.x * 0.9 + wp.z * 0.4) * 0.09 * wind;
      wp.z += cos(time * 1.8 + wp.z * 0.9 + wp.x * 0.3) * 0.07 * wind;
    } else if (mat > 2.5 && mat < 3.5 && normal.y > 0.5) { // water surface
      wp.y += (sin(time * 1.6 + wp.x * 0.9) + cos(time * 1.3 + wp.z * 0.8)) * 0.03 - 0.06;
    }
  }
  vWorldPos = wp.xyz;
  vShadow = shadowMatrix * wp;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
  const frag = /* glsl */`
uniform sampler2D map; uniform float daylight; uniform float ambient;
uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float time;
uniform float shaderOn; uniform sampler2D shadowMap; uniform vec3 sunDir; uniform vec3 sunColor;
uniform vec3 skyColor; uniform vec3 cameraPos; uniform float shadowStrength; uniform float rain; uniform float hasSky;
varying vec2 vUv; varying vec2 vLight; varying vec3 vColor; varying float vDist;
varying vec3 vWorldPos; varying vec3 vNormal; varying vec4 vShadow; varying float vMat;

vec2 animUv(vec2 uv) {
  if (vMat < 2.5) return uv;
  vec2 tile = floor(uv * 32.0 + 1e-4);
  vec2 loc = uv * 32.0 - tile;
  if (vMat < 3.5) loc = fract(loc + vec2(time * 0.04, time * 0.07));                  // water flow
  else if (vMat < 4.5) loc = fract(loc + vec2(sin(time * 0.3) * 0.15, time * 0.02));  // lava ooze
  else { vec2 c = loc - 0.5; float a = time * 0.6 + length(c) * 4.0; loc = fract(vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a)) + 0.5); }
  return (tile + clamp(loc, 0.002, 0.998)) / 32.0;
}

float shadowAt(vec3 n) {
  vec3 c = vShadow.xyz / vShadow.w;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float bias = 0.0006 + 0.0012 * (1.0 - abs(dot(n, sunDir)));
  float s = 0.0;
  float t = 1.0 / ${SHADOW_SIZE.toFixed(1)};
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    float d = texture2D(shadowMap, c.xy + vec2(float(x), float(y)) * t * 1.2).r;
    s += (c.z - bias) > d ? 0.0 : 1.0;
  }
  return s / 9.0;
}

void main(){
  vec4 t = texture2D(map, animUv(vUv));
  if (t.a < ${alphaTest.toFixed(2)}) discard;
  float s = vLight.x * daylight;
  float b = vLight.y;
  if (shaderOn < 0.5) {
    // classic lighting (close to the original look)
    float sb = pow(max(s, ambient), 1.5);
    float bb = pow(b, 1.5);
    vec3 l = max(vec3(sb), vec3(1.0, 0.9, 0.75) * bb);
    l = max(l, vec3(0.035));
    vec3 c = t.rgb * vColor * l;
    float f = clamp((vDist - fogNear) / (fogFar - fogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(c, fogColor, f), t.a);
  } else {
    vec3 n = normalize(vNormal);
    vec3 V = normalize(cameraPos - vWorldPos);
    float sky = vLight.x;
    float ndl = max(dot(n, sunDir), 0.0);
    if (vMat > 1.5 && vMat < 2.5) ndl = 0.6 + 0.4 * ndl;   // plants: lit from both sides
    if (vMat > 0.5 && vMat < 1.5) ndl = 0.35 + 0.65 * ndl; // leaves: translucency
    float sh = (hasSky > 0.5 && ndl > 0.0) ? mix(1.0, shadowAt(n), shadowStrength) : 0.0;
    vec3 albedo = t.rgb * vColor;
    vec3 amb = mix(vec3(0.05, 0.06, 0.09), mix(skyColor, vec3(0.88, 0.92, 1.0), 0.6) * 0.62, clamp(daylight * 1.15, 0.0, 1.0)) * (0.3 + 0.7 * sky * sky);
    amb = max(amb, vec3(ambient * 0.55));
    vec3 sun = sunColor * ndl * sh * sky * sky * (1.0 - rain * 0.7);
    vec3 torch = vec3(1.0, 0.72, 0.42) * pow(b, 2.0) * 1.35;
    vec3 col = albedo * (amb + sun * 1.25 + torch);
    // emissive blocks (lava, glow, portal)
    if (vMat > 3.5) col = t.rgb * vColor * (vMat < 4.5 ? 1.6 : 1.3);
    float alpha = t.a;
    if (vMat > 2.5 && vMat < 3.5) {
      // water: wave normal, fresnel reflection of the sky, sun glint
      vec3 wn = normalize(vec3(
        sin(vWorldPos.x * 1.7 + time * 1.9) * 0.07 + sin(vWorldPos.z * 3.1 + time * 2.7) * 0.04,
        1.0,
        cos(vWorldPos.z * 1.5 + time * 1.6) * 0.07 + cos(vWorldPos.x * 2.9 + time * 2.3) * 0.04));
      if (n.y < 0.5) wn = n;
      float fres = pow(1.0 - max(dot(wn, V), 0.0), 3.0);
      vec3 refl = mix(skyColor, sunColor * 0.6 + skyColor * 0.4, pow(max(dot(reflect(-V, wn), sunDir), 0.0), 6.0));
      float spec = pow(max(dot(reflect(-sunDir, wn), V), 0.0), 120.0) * sh * sky * 4.0;
      vec3 deep = albedo * (amb + sun * 0.6 + torch) * 0.7;
      col = mix(deep, refl * (0.25 + 0.75 * sky) , clamp(0.25 + fres, 0.0, 0.9)) + sunColor * spec;
      alpha = clamp(0.62 + fres * 0.35, 0.0, 0.97);
    }
    // wet look in rain
    if (rain > 0.0 && n.y > 0.5 && sky > 0.9) col *= 1.0 - rain * 0.18;
    // fog with sun scattering
    float f = clamp((vDist - fogNear * 0.6) / (fogFar - fogNear * 0.6), 0.0, 1.0);
    f = f * f;
    vec3 vd = normalize(vWorldPos - cameraPos);
    vec3 fc = mix(fogColor, sunColor * 1.1, pow(max(dot(vd, sunDir), 0.0), 8.0) * 0.6 * daylight);
    gl_FragColor = vec4(mix(col, fc, f), alpha);
  }
  #include <colorspace_fragment>
}`;
  return { vert, frag, translucent };
}

// ---------------------------------------------------------------- sky dome
export function makeSkyDome(uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
uniform vec3 skyColor; uniform vec3 fogColor; uniform vec3 sunDir; uniform vec3 sunColor; uniform float shaderOn; uniform float daylight;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 c = mix(fogColor, skyColor, smoothstep(0.0, 0.45, h));
  if (h < 0.0) c = mix(fogColor, fogColor * 0.6, -h * 5.0);
  if (shaderOn > 0.5) {
    float sd = max(dot(d, sunDir), 0.0);
    c += sunColor * (pow(sd, 12.0) * 0.45 + pow(sd, 400.0) * 1.5) * daylight;
    c = mix(c, c * vec3(1.05, 0.98, 1.1), 0.5);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ---------------------------------------------------------------- shadow + post pipeline
const quadVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class ShaderPipeline {
  constructor(renderer, worldUniforms) {
    this.renderer = renderer;
    this.u = worldUniforms;
    this.enabled = false;
    // shadow map
    this.shadowRT = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthBuffer: true });
    this.shadowRT.depthTexture = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE);
    this.shadowRT.depthTexture.type = THREE.UnsignedIntType;
    this.shadowCam = new THREE.OrthographicCamera(-SHADOW_RANGE, SHADOW_RANGE, SHADOW_RANGE, -SHADOW_RANGE, 1, 500);
    this.shadowMat = new THREE.ShaderMaterial({
      uniforms: worldUniforms,
      vertexShader: /* glsl */`
attribute float mat; uniform float time; uniform float rain; varying vec2 vUv;
void main(){
  vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0);
  float wind = 1.0 + rain * 1.5;
  if (mat > 0.5 && mat < 1.5) { wp.x += sin(time * 1.7 + wp.x * 0.6 + wp.y * 0.4) * 0.035 * wind; wp.z += cos(time * 1.3 + wp.z * 0.6 + wp.y * 0.3) * 0.035 * wind; }
  else if (mat > 1.5 && mat < 2.5) { wp.x += sin(time * 2.1 + wp.x * 0.9 + wp.z * 0.4) * 0.09 * wind; wp.z += cos(time * 1.8 + wp.z * 0.9 + wp.x * 0.3) * 0.07 * wind; }
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
      fragmentShader: /* glsl */`uniform sampler2D map; varying vec2 vUv; void main(){ if (texture2D(map, vUv).a < 0.5) discard; gl_FragColor = vec4(1.0); }`,
      side: THREE.DoubleSide,
    });
    this.u.shadowMap.value = this.shadowRT.depthTexture;
    // post targets
    const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: true });
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.bloomA = new THREE.WebGLRenderTarget(1, 1, { type });
    this.bloomB = new THREE.WebGLRenderTarget(1, 1, { type });
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null } }, vertexShader: quadVert, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`uniform sampler2D tex; varying vec2 vUv;
void main(){ vec3 c = texture2D(tex, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(c * smoothstep(0.75, 1.4, l), 1.0); }`,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: quadVert, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tex, vUv).rgb * 0.227;
  c += texture2D(tex, vUv + dir * 1.38).rgb * 0.316; c += texture2D(tex, vUv - dir * 1.38).rgb * 0.316;
  c += texture2D(tex, vUv + dir * 3.23).rgb * 0.070; c += texture2D(tex, vUv - dir * 3.23).rgb * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tex: { value: null }, depth: { value: null }, bloom: { value: null },
        sunScreen: { value: new THREE.Vector2(0.5, 0.5) }, sunVis: { value: 0 }, sunColor: worldUniforms.sunColor,
        underwater: { value: 0 }, time: worldUniforms.time,
      },
      vertexShader: quadVert, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`
uniform sampler2D tex; uniform sampler2D depth; uniform sampler2D bloom;
uniform vec2 sunScreen; uniform float sunVis; uniform vec3 sunColor; uniform float underwater; uniform float time;
varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUv;
  if (underwater > 0.5) uv += vec2(sin(uv.y * 30.0 + time * 2.0), cos(uv.x * 25.0 + time * 1.7)) * 0.0025;
  vec3 c = texture2D(tex, uv).rgb;
  c += texture2D(bloom, uv).rgb * 0.55;
  // god rays: radial blur of the sky mask toward the sun
  if (sunVis > 0.0) {
    vec2 delta = (uv - sunScreen) / 28.0;
    vec2 p = uv; float acc = 0.0; float w = 1.0;
    for (int i = 0; i < 28; i++) {
      p -= delta;
      float d = texture2D(depth, clamp(p, 0.0, 1.0)).r;
      acc += (d >= 0.9999 ? 1.0 : 0.0) * w; w *= 0.95;
    }
    c += sunColor * acc / 28.0 * 0.32 * sunVis;
  }
  c = aces(c * 1.1);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.08);                 // saturation
  c = (c - 0.5) * 1.06 + 0.5;                // contrast
  vec2 v = vUv - 0.5;
  c *= 1.0 - dot(v, v) * 0.55;               // vignette
  if (underwater > 0.5) c *= vec3(0.6, 0.8, 1.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  #include <colorspace_fragment>
}`,
    });
  }

  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    this.sceneRT.setSize(W, H);
    this.sceneRT.depthTexture.image.width = W; this.sceneRT.depthTexture.image.height = H;
    this.bloomA.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    this.bloomB.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    this.bw = Math.max(1, W >> 2); this.bh = Math.max(1, H >> 2);
  }

  // Render the sun's depth map of the world group (opaque/cutout meshes only).
  renderShadows(scene, worldGroup, center, sunDir) {
    const cam = this.shadowCam;
    // snap to texel grid to avoid shimmering
    const texel = (SHADOW_RANGE * 2) / SHADOW_SIZE;
    const up = Math.abs(sunDir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    cam.position.copy(center).addScaledVector(sunDir, 200);
    cam.up.copy(up);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    // snap in light space
    const inv = cam.matrixWorldInverse.clone();
    const lc = center.clone().applyMatrix4(inv);
    const sx = Math.round(lc.x / texel) * texel - lc.x, sy = Math.round(lc.y / texel) * texel - lc.y;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const upv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(right, -sx).addScaledVector(upv, -sy);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const hidden = [];
    for (const o of scene.children) if (o !== worldGroup && o.visible) { o.visible = false; hidden.push(o); }
    const hiddenMeshes = [];
    for (const m of worldGroup.children) if (m.visible && m.renderOrder === 1) { m.visible = false; hiddenMeshes.push(m); }
    const prevOverride = scene.overrideMaterial, prevBg = scene.background;
    scene.overrideMaterial = this.shadowMat;
    scene.background = null;
    this.renderer.setRenderTarget(this.shadowRT);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    this.renderer.setRenderTarget(null);
    scene.overrideMaterial = prevOverride; scene.background = prevBg;
    for (const o of hidden) o.visible = true;
    for (const m of hiddenMeshes) m.visible = true;
    const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.u.shadowMatrix.value.copy(bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // Render scene through bloom/god rays/tonemap composite to the screen.
  renderScene(scene, camera, sunWorldPos, sunVisible, underwater) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    this.brightMat.uniforms.tex.value = this.sceneRT.texture;
    this.pass(this.brightMat, this.bloomA);
    for (let i = 0; i < 2; i++) {
      this.blurMat.uniforms.tex.value = this.bloomA.texture; this.blurMat.uniforms.dir.value.set(1.5 / this.bw, 0);
      this.pass(this.blurMat, this.bloomB);
      this.blurMat.uniforms.tex.value = this.bloomB.texture; this.blurMat.uniforms.dir.value.set(0, 1.5 / this.bh);
      this.pass(this.blurMat, this.bloomA);
    }
    const cu = this.compositeMat.uniforms;
    cu.tex.value = this.sceneRT.texture; cu.depth.value = this.sceneRT.depthTexture; cu.bloom.value = this.bloomA.texture;
    const sp = sunWorldPos.clone().project(camera);
    const inFront = sp.z < 1 && sp.z > -1;
    cu.sunScreen.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const edge = Math.max(0, 1 - Math.max(Math.abs(sp.x), Math.abs(sp.y)) * 0.6);
    cu.sunVis.value = sunVisible && inFront ? edge : 0;
    cu.underwater.value = underwater ? 1 : 0;
    this.pass(this.compositeMat, null);
  }
}
